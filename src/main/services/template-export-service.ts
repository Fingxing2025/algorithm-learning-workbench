import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { execFile, type ChildProcess } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { BrowserWindow, dialog } from 'electron'

import type { TemplateExportRequest, TemplateExportResult } from '@core/contracts/template-export'
import { templateExportRequestSchema } from '@core/contracts/template-export'

import { TemplateManagementRepository } from '../database/template-management-repository'
import { WorkspaceRepository } from '../database/workspace-repository'
import { PublicError } from '../errors/public-error'
import { resolveAuthorizedFile, resolveAuthorizedRoot } from '../security/path-guard'
import { decodeTemplateSourceBuffer } from './template-source-codec'
import {
  renderTemplateExportDoc,
  renderTemplateExportHtml,
  renderTemplateExportDocument,
  type TemplateExportDocument,
} from './template-export-renderer'

const MAX_TEMPLATES_PER_EXPORT = 100
const execFileAsync = promisify(execFile)

function safeStem(value: string): string {
  const stem = value.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/gu, '')
  return (stem || '算法模板册').slice(0, 180)
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new PublicError('TASK_CANCELLED', '导出已取消，未写入完整产物。')
}

export class TemplateExportService {
  private readonly activeProcesses = new Map<string, ChildProcess>()
  private readonly activeControllers = new Map<string, AbortController>()
  private readonly cancelled = new Set<string>()

  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly metadataRepository: TemplateManagementRepository,
  ) {}

  cancel(requestId: string): void {
    this.cancelled.add(requestId)
    this.activeControllers.get(requestId)?.abort()
    this.activeProcesses.get(requestId)?.kill('SIGTERM')
  }

  async export(
    rawRequest: TemplateExportRequest,
    parentWindow?: BrowserWindow,
  ): Promise<TemplateExportResult | null> {
    const request = templateExportRequestSchema.parse(rawRequest)
    if (request.templateIds.length > MAX_TEMPLATES_PER_EXPORT) {
      throw new PublicError('INVALID_REQUEST', `每次最多导出 ${MAX_TEMPLATES_PER_EXPORT} 份模板。`)
    }
    const workspace = this.workspaceRepository.getActiveWorkspace()
    if (!workspace) throw new PublicError('WORKSPACE_REQUIRED', '请先创建或选择模板工作区。')

    const saveResult = parentWindow
      ? await dialog.showSaveDialog(parentWindow, {
          buttonLabel: '选择导出位置',
          defaultPath: '算法模板册.tex',
          filters: [{ extensions: ['tex'], name: 'LaTeX 文档' }],
          title: '导出算法模板册',
        })
      : await dialog.showSaveDialog({
          buttonLabel: '选择导出位置',
          defaultPath: '算法模板册.tex',
          filters: [{ extensions: ['tex'], name: 'LaTeX 文档' }],
          title: '导出算法模板册',
        })
    if (saveResult.canceled || !saveResult.filePath) return null

    const requestId = request.requestId ?? randomUUID()
    const controller = new AbortController()
    this.activeControllers.set(requestId, controller)
    if (this.cancelled.delete(requestId)) controller.abort()
    const documents: TemplateExportDocument[] = []
    try {
      const root = await resolveAuthorizedRoot(workspace.rootPath)
      const summaries = request.templateIds.map(id => {
        const summary = this.workspaceRepository.getTemplateSummary(workspace.id, id)
        if (!summary)
          throw new PublicError('TEMPLATE_NOT_FOUND', '所选模板不存在或已不可用，请刷新后重试。')
        return summary
      })
      const metadata = request.includeMetadata
        ? this.metadataRepository.listMetadataMap(summaries.map(summary => summary.id))
        : new Map()
      for (const template of summaries) {
        throwIfAborted(controller.signal)
        const resolved = await resolveAuthorizedFile(root, template.relativePath)
        let decoded
        try {
          decoded = decodeTemplateSourceBuffer(await readFile(resolved.absolutePath))
        } catch {
          throw new PublicError(
            'FILE_UNAVAILABLE',
            '模板源码无法按受支持的 UTF-8、UTF-16 或中文编码读取，请检查文件后重试。',
          )
        }
        documents.push({ metadata: metadata.get(template.id), source: decoded.content, template })
      }

      const selectedName = basename(saveResult.filePath)
      const stem = safeStem(selectedName.replace(/\.tex$/iu, ''))
      const texFileName = `${stem}.tex`
      const pdfFileName = `${stem}.pdf`
      const docFileName = `${stem}.doc`
      const resourceDirectoryName = `${stem}-resources`
      const targetDirectory = dirname(saveResult.filePath)
      const targetTex = join(targetDirectory, texFileName)
      const targetPdf = join(targetDirectory, pdfFileName)
      const targetDoc = join(targetDirectory, docFileName)
      const targetResources = join(targetDirectory, resourceDirectoryName)
      for (const target of [
        targetTex,
        targetResources,
        ...(request.compilePdf ? [targetPdf] : []),
        ...(request.generateDoc ? [targetDoc] : []),
      ]) {
        if (await exists(target)) {
          throw new PublicError(
            'FILE_ALREADY_EXISTS',
            `导出目标“${basename(target)}”已存在，请选择其他位置。`,
          )
        }
      }

      const temporaryDirectory = join(targetDirectory, `.${stem}.export-${randomUUID()}`)
      await mkdir(temporaryDirectory, { recursive: false, mode: 0o700 })
      const publishedTargets: string[] = []
      try {
        const tex = renderTemplateExportDocument(documents, request.includeMetadata)
        const temporaryTex = join(temporaryDirectory, texFileName)
        await writeFileSafe(temporaryTex, tex)
        await mkdir(join(temporaryDirectory, resourceDirectoryName), { mode: 0o700 })
        await writeFileSafe(
          join(temporaryDirectory, resourceDirectoryName, 'README.txt'),
          '本目录为算法模板册的资源目录，当前版本代码直接嵌入 .tex。\n',
        )

        let pdfStatus: TemplateExportResult['pdfStatus'] = 'not-requested'
        let compileMessage = '已生成 LaTeX 文档。'
        if (request.compilePdf) {
          // Prefer Chromium so the compact/highlighted PDF is available without TeX.
          throwIfAborted(controller.signal)
          let usedBuiltInPdf = false
          try {
            const htmlPath = join(temporaryDirectory, `${stem}.print.html`)
            await writeFileSafe(
              htmlPath,
              renderTemplateExportHtml(documents, request.includeMetadata),
            )
            const pdf = await renderBuiltInPdf(htmlPath, controller.signal)
            await writeBufferSafe(join(temporaryDirectory, pdfFileName), pdf)
            usedBuiltInPdf = true
            pdfStatus = 'generated'
            compileMessage = '已使用内置 PDF 引擎生成紧凑高亮 PDF，无需安装 TeX。'
          } catch {
            if (controller.signal.aborted)
              throw new PublicError('TASK_CANCELLED', '导出已取消，未写入完整产物。')
          }
          if (!usedBuiltInPdf) {
            const compiler = await detectCompiler()
            let usedTexCompiler = false
            if (compiler) {
              try {
                await runCompiler(
                  compiler,
                  texFileName,
                  temporaryDirectory,
                  requestId,
                  controller.signal,
                  this.activeProcesses,
                )
                usedTexCompiler = await exists(join(temporaryDirectory, pdfFileName))
              } catch {
                if (controller.signal.aborted)
                  throw new PublicError('TASK_CANCELLED', '导出已取消，未写入完整产物。')
              }
            }
            if (usedTexCompiler) {
              pdfStatus = 'generated'
              compileMessage = 'LaTeX 与 PDF 均已生成。'
            } else {
              pdfStatus = 'failed'
              compileMessage = 'PDF 生成失败；请重试并检查应用权限。'
            }
          }
        }

        let docStatus: TemplateExportResult['docStatus'] = 'not-requested'
        if (request.generateDoc) {
          try {
            await writeFileSafe(
              join(temporaryDirectory, docFileName),
              renderTemplateExportDoc(documents, request.includeMetadata),
            )
            docStatus = 'generated'
          } catch {
            docStatus = 'failed'
            compileMessage = `${compileMessage} Word 文档生成失败，请重试。`
          }
        }

        throwIfAborted(controller.signal)
        try {
          await rename(temporaryTex, targetTex)
          publishedTargets.push(targetTex)
          await rename(join(temporaryDirectory, resourceDirectoryName), targetResources)
          publishedTargets.push(targetResources)
          if (pdfStatus === 'generated') {
            await rename(join(temporaryDirectory, pdfFileName), targetPdf)
            publishedTargets.push(targetPdf)
          }
          if (docStatus === 'generated') {
            await rename(join(temporaryDirectory, docFileName), targetDoc)
            publishedTargets.push(targetDoc)
          }
        } catch {
          await Promise.all(
            publishedTargets.map(target => rm(target, { force: true, recursive: true })),
          )
          throw new PublicError('FILE_UNAVAILABLE', '导出文件发布失败，未覆盖已有文件；请重试。')
        }
        const texBytes = Buffer.byteLength(tex, 'utf8')
        const generatedFileCount =
          2 + (pdfStatus === 'generated' ? 1 : 0) + (docStatus === 'generated' ? 1 : 0)
        return {
          compileMessage,
          docFileName: docStatus === 'generated' ? docFileName : null,
          docStatus,
          generatedFileCount,
          pdfFileName: pdfStatus === 'generated' ? pdfFileName : null,
          pdfStatus,
          resourceDirectoryName,
          templateCount: documents.length,
          texBytes,
          texFileName,
        }
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true }).catch(() => undefined)
      }
    } finally {
      this.activeProcesses.delete(requestId)
      this.activeControllers.delete(requestId)
      this.cancelled.delete(requestId)
    }
  }
}

async function writeFileSafe(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
}

async function writeBufferSafe(path: string, content: Buffer): Promise<void> {
  await writeFile(path, content, { mode: 0o600, flag: 'wx' })
}

async function renderBuiltInPdf(htmlPath: string, signal: AbortSignal): Promise<Buffer> {
  throwIfAborted(signal)
  const window = new BrowserWindow({
    height: 1600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      javascript: false,
      nodeIntegration: false,
      sandbox: true,
    },
    width: 1200,
  })
  try {
    await window.loadFile(htmlPath)
    throwIfAborted(signal)
    const pdfOptions = {
      pageSize: 'A4' as const,
      printBackground: true,
      preferCSSPageSize: true,
    }
    return Buffer.from(await window.webContents.printToPDF(pdfOptions))
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function detectCompiler(): Promise<'latexmk' | 'xelatex' | null> {
  try {
    await execFileAsync('latexmk', ['-v'], { timeout: 5_000, windowsHide: true })
    return 'latexmk'
  } catch {
    try {
      await execFileAsync('xelatex', ['--version'], { timeout: 5_000, windowsHide: true })
      return 'xelatex'
    } catch {
      return null
    }
  }
}

async function runCompiler(
  compiler: 'latexmk' | 'xelatex',
  texFileName: string,
  cwd: string,
  requestId: string,
  signal: AbortSignal,
  processes: Map<string, ChildProcess>,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const args =
      compiler === 'latexmk'
        ? ['-xelatex', '-interaction=nonstopmode', '-halt-on-error', texFileName]
        : ['-interaction=nonstopmode', '-halt-on-error', texFileName]
    const child = execFile(compiler, args, { cwd, timeout: 120_000, windowsHide: true }, error => {
      processes.delete(requestId)
      if (error) reject(error)
      else resolvePromise()
    })
    processes.set(requestId, child)
    signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true })
  })
}

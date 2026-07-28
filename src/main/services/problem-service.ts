import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, join, sep } from 'node:path'

import { dialog, type BrowserWindow } from 'electron'

import type {
  CreateProblemRequest,
  Problem,
  ProblemImageData,
  ProblemPage,
  ProblemPageRequest,
  TemplateProblemPage,
  TemplateProblemPageRequest,
  RemoveProblemImageRequest,
  RemoveProblemRelationRequest,
  UpdateProblemRequest,
  UpsertProblemRelationRequest,
} from '@core/contracts/problem'

import { ProblemRepository, type NewProblemImage } from '../database/problem-repository'
import { WorkspaceRepository } from '../database/workspace-repository'
import { PublicError } from '../errors/public-error'
import { resolveAuthorizedFile } from '../security/path-guard'
import type { WorkspaceStorageManager } from './workspace-storage'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_IMAGES_PER_PROBLEM = 12
const PROBLEM_IMAGE_PREFIX = 'problem-images/'

interface DetectedImage {
  extension: '.jpg' | '.png' | '.webp'
  mediaType: NewProblemImage['mediaType']
}

function detectImage(buffer: Buffer): DetectedImage | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer.subarray(1, 4).toString('ascii') === 'PNG' &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { extension: '.png', mediaType: 'image/png' }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: '.jpg', mediaType: 'image/jpeg' }
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { extension: '.webp', mediaType: 'image/webp' }
  }
  return null
}

function toPortablePath(...parts: string[]): string {
  return join(...parts)
    .split(sep)
    .join('/')
}

export class ProblemService {
  constructor(
    private readonly repository: ProblemRepository,
    private readonly userDataPath: string,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly workspaceStorage?: WorkspaceStorageManager,
  ) {}

  async addImages(problemId: string, parentWindow?: BrowserWindow): Promise<Problem | null> {
    const workspaceId = this.requireWorkspaceId()
    this.requireProblem(workspaceId, problemId)
    const options: Electron.OpenDialogOptions = {
      buttonLabel: '添加到题目',
      filters: [{ extensions: ['jpg', 'jpeg', 'png', 'webp'], name: '题目图片' }],
      properties: ['openFile', 'multiSelections'],
      title: '选择题目图片',
    }
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const existingCount = this.repository.countImages(workspaceId, problemId)
    if (existingCount + result.filePaths.length > MAX_IMAGES_PER_PROBLEM) {
      throw new PublicError(
        'IMAGE_LIMIT_REACHED',
        `每道题最多保存 ${MAX_IMAGES_PER_PROBLEM} 张图片。`,
      )
    }

    const selectedImages: Array<{
      buffer: Buffer
      detected: DetectedImage
      originalName: string
    }> = []
    for (const selectedPath of result.filePaths) {
      try {
        const linkStats = await lstat(selectedPath)
        if (!linkStats.isFile() || linkStats.isSymbolicLink()) {
          throw new PublicError('FILE_UNAVAILABLE', '所选图片不可读取，请重新选择。')
        }
        const selectedStats = await stat(selectedPath)
        if (selectedStats.size > MAX_IMAGE_BYTES) {
          throw new PublicError('FILE_TOO_LARGE', '单张题目图片不能超过 8 MiB。')
        }
        const buffer = await readFile(selectedPath)
        const detected = detectImage(buffer)
        if (!detected) {
          throw new PublicError('INVALID_REQUEST', '仅支持真实的 PNG、JPEG 或 WebP 图片。')
        }
        selectedImages.push({
          buffer,
          detected,
          originalName: (basename(selectedPath).slice(0, 255) || '题目图片').normalize('NFC'),
        })
      } catch (error) {
        if (error instanceof PublicError) {
          throw error
        }
        throw new PublicError('FILE_UNAVAILABLE', '所选图片不可读取，请重新选择。')
      }
    }

    const targetDirectory = join(this.getProblemImageRoot(), problemId)
    await mkdir(targetDirectory, { recursive: true })
    const createdPaths: string[] = []
    const imageRows: NewProblemImage[] = []
    try {
      for (const image of selectedImages) {
        const id = randomUUID()
        const fileName = `${id}${image.detected.extension}`
        const absolutePath = join(targetDirectory, fileName)
        await writeFile(absolutePath, image.buffer, { flag: 'wx' })
        createdPaths.push(absolutePath)
        imageRows.push({
          id,
          mediaType: image.detected.mediaType,
          originalName: image.originalName,
          relativePath: toPortablePath('problem-images', problemId, fileName),
          sizeBytes: image.buffer.byteLength,
        })
      }
      this.repository.addImages(workspaceId, problemId, imageRows)
    } catch {
      await Promise.all(createdPaths.map(path => unlink(path).catch(() => undefined)))
      throw new PublicError('FILE_UNAVAILABLE', '无法保存题目图片，请重试。')
    }

    return this.requireProblem(workspaceId, problemId)
  }

  createProblem(request: CreateProblemRequest): Problem {
    return this.repository.createProblem(this.requireWorkspaceId(), request)
  }

  async deleteProblem(problemId: string): Promise<void> {
    const workspaceId = this.requireWorkspaceId()
    this.requireProblem(workspaceId, problemId)
    const imageRoot = this.getProblemImageRoot()
    const sourceDirectory = join(imageRoot, problemId)
    const trashDirectory = join(imageRoot, '.trash')
    const trashPath = join(trashDirectory, `${problemId}-${randomUUID()}`)
    let movedImages = false

    try {
      const stats = await lstat(sourceDirectory)
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new PublicError('FILE_UNAVAILABLE', '题目图片目录无效，已停止删除。')
      }
      await mkdir(trashDirectory, { recursive: true })
      await rename(sourceDirectory, trashPath)
      movedImages = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (error instanceof PublicError) throw error
        throw new PublicError('FILE_UNAVAILABLE', '无法隔离题目图片，题目尚未删除。')
      }
    }

    try {
      if (!this.repository.deleteProblem(workspaceId, problemId)) {
        throw new PublicError('PROBLEM_NOT_FOUND', '题目卡片不存在或已经被移除。')
      }
    } catch (error) {
      if (movedImages) {
        await rename(trashPath, sourceDirectory).catch(() => undefined)
      }
      throw error
    }

    if (movedImages) {
      await rm(trashPath, { force: true, recursive: true }).catch(() => undefined)
    }
  }

  getProblems(): Problem[] {
    return this.repository.listProblems(this.requireWorkspaceId())
  }

  getProblem(problemId: string): Problem {
    return this.requireProblem(this.requireWorkspaceId(), problemId)
  }

  getProblemsByTemplate(request: TemplateProblemPageRequest): TemplateProblemPage {
    return this.repository.listProblemsByTemplate(this.requireWorkspaceId(), request)
  }

  getProblemsPage(request: ProblemPageRequest): ProblemPage {
    return this.repository.listProblemsPage(this.requireWorkspaceId(), request)
  }

  async readImage(imageId: string): Promise<ProblemImageData> {
    const image = this.repository.getImage(this.requireWorkspaceId(), imageId)
    if (!image) {
      throw new PublicError('FILE_UNAVAILABLE', '题目图片不存在或记录无效。')
    }
    const resolved = await this.resolveStoredImage(image.relativePath)
    if (resolved.sizeBytes > MAX_IMAGE_BYTES) {
      throw new PublicError('FILE_TOO_LARGE', '题目图片超过 8 MiB，无法显示。')
    }
    const buffer = await readFile(resolved.absolutePath)
    const detected = detectImage(buffer)
    if (!detected || detected.mediaType !== image.mediaType) {
      throw new PublicError('FILE_UNAVAILABLE', '题目图片内容与记录不一致。')
    }
    return {
      dataUrl: `data:${detected.mediaType};base64,${buffer.toString('base64')}`,
      imageId,
    }
  }

  async removeImage(request: RemoveProblemImageRequest): Promise<Problem> {
    const workspaceId = this.requireWorkspaceId()
    const image = this.repository.getImage(workspaceId, request.imageId, request.problemId)
    if (!image) {
      throw new PublicError('FILE_UNAVAILABLE', '题目图片不存在或已经移除。')
    }

    let sourcePath: string | null = null
    try {
      sourcePath = (await this.resolveStoredImage(image.relativePath)).absolutePath
    } catch (error) {
      if (!(error instanceof PublicError) || error.code !== 'FILE_UNAVAILABLE') {
        throw error
      }
    }

    const trashDirectory = join(this.getProblemImageRoot(), '.trash')
    const trashPath = join(trashDirectory, `${image.id}.deleted`)
    let movedToTrash = false
    if (sourcePath) {
      await mkdir(trashDirectory, { recursive: true })
      await rename(sourcePath, trashPath).catch(() => {
        throw new PublicError('FILE_UNAVAILABLE', '无法暂存待移除图片，请重试。')
      })
      movedToTrash = true
    }

    try {
      if (!this.repository.removeImage(workspaceId, request.imageId, request.problemId)) {
        throw new PublicError('FILE_UNAVAILABLE', '题目图片不存在或已经移除。')
      }
    } catch (error) {
      if (movedToTrash && sourcePath) {
        await rename(trashPath, sourcePath).catch(() => undefined)
      }
      throw error
    }

    if (movedToTrash) {
      await unlink(trashPath).catch(() => undefined)
    }
    return this.requireProblem(workspaceId, request.problemId)
  }

  removeRelation(request: RemoveProblemRelationRequest): Problem {
    const workspaceId = this.requireWorkspaceId()
    this.requireProblem(workspaceId, request.problemId)
    if (!this.repository.removeRelation(workspaceId, request.problemId, request.templateId)) {
      throw new PublicError('INVALID_REQUEST', '该题目与模板之间没有可解除的关联。')
    }
    return this.requireProblem(workspaceId, request.problemId)
  }

  updateProblem(request: UpdateProblemRequest): Problem {
    const problem = this.repository.updateProblem(this.requireWorkspaceId(), request)
    if (!problem) {
      throw new PublicError('PROBLEM_NOT_FOUND', '题目卡片不存在或已经被移除。')
    }
    return problem
  }

  upsertRelation(request: UpsertProblemRelationRequest): Problem {
    const workspaceId = this.requireWorkspaceId()
    this.requireProblem(workspaceId, request.problemId)
    if (!this.repository.isTemplateAvailable(workspaceId, request.templateId)) {
      throw new PublicError('TEMPLATE_NOT_FOUND', '所选模板当前不可用，请重新扫描工作区。')
    }
    return this.repository.upsertRelation(workspaceId, request)
  }

  private requireProblem(workspaceId: string, problemId: string): Problem {
    const problem = this.repository.getProblem(workspaceId, problemId)
    if (!problem) {
      throw new PublicError('PROBLEM_NOT_FOUND', '题目卡片不存在或已经被移除。')
    }
    return problem
  }

  private requireWorkspaceId(): string {
    const workspace = this.workspaceRepository.getActiveWorkspace()
    if (!workspace) {
      throw new PublicError('WORKSPACE_REQUIRED', '请先创建或选择模板工作区。')
    }
    return workspace.id
  }

  private async resolveStoredImage(relativePath: string) {
    if (!relativePath.startsWith(PROBLEM_IMAGE_PREFIX)) {
      throw new PublicError('PATH_NOT_AUTHORIZED', '题目图片记录不在受控目录内。')
    }
    const pathWithinImageRoot = relativePath.slice(PROBLEM_IMAGE_PREFIX.length)
    if (!pathWithinImageRoot || pathWithinImageRoot.startsWith('.trash/')) {
      throw new PublicError('PATH_NOT_AUTHORIZED', '题目图片记录不在受控目录内。')
    }
    return resolveAuthorizedFile(this.getProblemImageRoot(), pathWithinImageRoot)
  }

  private getProblemImageRoot(): string {
    return (
      this.workspaceStorage?.current?.problemImagesRoot ?? join(this.userDataPath, 'problem-images')
    )
  }
}

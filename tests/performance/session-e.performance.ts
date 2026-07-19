import { execFile, execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { promisify } from 'node:util'

import { afterAll, describe, expect, it } from 'vitest'

import { createAppDatabase } from '../../src/main/database/database'
import { ProblemRepository } from '../../src/main/database/problem-repository'
import { TemplateManagementRepository } from '../../src/main/database/template-management-repository'
import { WorkspaceRepository } from '../../src/main/database/workspace-repository'
import { TemplateManagementService } from '../../src/main/services/template-management-service'
import { scanTemplateWorkspace } from '../../src/main/services/template-scanner'
import { WorkspaceAiContextService } from '../../src/main/services/workspace-ai-context-service'
import {
  buildTemplateTree,
  flattenTemplateTree,
  getDirectoryRowIds,
  getExpansionIdsForTemplate,
} from '../../src/renderer/src/features/templates/template-tree-model'
import { createPerformanceWorkspace, seedPerformanceDatabase } from './session-e-fixture'

const runs = Math.max(3, Number.parseInt(process.env.PERF_RUNS ?? '5', 10))
const sizes = (process.env.PERF_SIZES ?? '1000,5000,10000')
  .split(',')
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(value => Number.isInteger(value) && value > 0)
const label = (process.env.PERF_LABEL ?? 'baseline').replace(/[^a-z0-9_-]/gi, '-')
const reportRoot = resolve(process.env.PERF_OUTPUT_DIR ?? 'output/performance')
const temporaryRoots: string[] = []
const execFileAsync = promisify(execFile)

interface Sample {
  durationMs: number
  peakRssBytes: number
}

interface MetricSummary {
  p50Ms: number
  p95Ms: number
  peakRssBytes: number
  runs: number
  samplesMs: number[]
}

interface ScaleResult {
  counts: { images: number; problems: number; relations: number; templates: number }
  metrics: Record<string, MetricSummary | null>
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function percentile(values: number[], quantile: number): number {
  const ordered = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(ordered.length * quantile) - 1)
  return ordered[index] ?? 0
}

function summarize(samples: Sample[]): MetricSummary {
  const durations = samples.map(sample => sample.durationMs)
  return {
    p50Ms: round(percentile(durations, 0.5)),
    p95Ms: round(percentile(durations, 0.95)),
    peakRssBytes: Math.max(...samples.map(sample => sample.peakRssBytes)),
    runs: samples.length,
    samplesMs: durations.map(round),
  }
}

async function measure<T>(action: () => Promise<T> | T): Promise<{ sample: Sample; value: T }> {
  let peakRssBytes = process.memoryUsage().rss
  const interval = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)
  }, 5)
  const startedAt = performance.now()
  try {
    const value = await action()
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)
    return {
      sample: { durationMs: performance.now() - startedAt, peakRssBytes },
      value,
    }
  } finally {
    clearInterval(interval)
  }
}

async function repeat(action: () => Promise<unknown> | unknown): Promise<MetricSummary> {
  const samples: Sample[] = []
  for (let index = 0; index < runs; index += 1) samples.push((await measure(action)).sample)
  return summarize(samples)
}

async function repeatSamples(action: () => Promise<Sample>): Promise<MetricSummary> {
  const samples: Sample[] = []
  for (let index = 0; index < runs; index += 1) samples.push(await action())
  return summarize(samples)
}

function createAuditService(args: {
  metadataRepository: TemplateManagementRepository
  userDataPath: string
  workspaceRepository: WorkspaceRepository
  workspaceAiContextService: WorkspaceAiContextService
}) {
  return new TemplateManagementService(
    {} as never,
    args.metadataRepository,
    args.workspaceRepository,
    {} as never,
    args.userDataPath,
    args.workspaceAiContextService,
    {} as never,
  )
}

async function electronStartup(userDataPath: string): Promise<Sample> {
  const environment = {
    ...process.env,
  }
  delete environment.ELECTRON_RUN_AS_NODE
  const { stdout } = await execFileAsync(
    process.env.PERF_NODE_EXECUTABLE ?? 'node',
    [resolve('scripts/measure-electron-startup.mjs'), userDataPath],
    {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: environment,
      maxBuffer: 1024 * 1024,
    },
  )
  const parsed = JSON.parse(stdout.trim()) as Sample
  return {
    durationMs: parsed.durationMs,
    peakRssBytes: parsed.peakRssBytes,
  }
}

function systemDetails() {
  let macosVersion: string | null = null
  try {
    macosVersion = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim()
  } catch {
    // Other platforms use the generic OS fields below.
  }
  return {
    architecture: arch(),
    cpu: cpus()[0]?.model ?? 'unknown',
    cpuCount: cpus().length,
    electron: '43.1.0',
    macosVersion,
    memoryBytes: totalmem(),
    node: process.version,
    osPlatform: platform(),
    osRelease: release(),
  }
}

function markdownReport(report: {
  generatedAt: string
  label: string
  scales: Record<string, ScaleResult>
}): string {
  const lines = [
    `# Session E ${report.label} performance results`,
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Runs per metric: ${runs}. Startup is process-cold with filesystem cache left in its natural state; the command does not purge OS caches.`,
    '',
    '| Scale | Metric | P50 ms | P95 ms | Peak RSS MiB |',
    '| ---: | --- | ---: | ---: | ---: |',
  ]
  for (const [scale, result] of Object.entries(report.scales)) {
    for (const [metric, summary] of Object.entries(result.metrics)) {
      if (!summary) {
        lines.push(`| ${scale} | ${metric} | unavailable | unavailable | unavailable |`)
        continue
      }
      lines.push(
        `| ${scale} | ${metric} | ${summary.p50Ms} | ${summary.p95Ms} | ${round(summary.peakRssBytes / 1024 / 1024)} |`,
      )
    }
  }
  lines.push(
    '',
    'Privacy: the report contains counts, timings, runtime versions and aggregate memory only. It excludes source, problem statements, provider responses, API keys and filesystem paths.',
    '',
  )
  return lines.join('\n')
}

describe('Session E deterministic performance benchmark', () => {
  afterAll(async () => {
    await Promise.all(temporaryRoots.map(path => rm(path, { force: true, recursive: true })))
  })

  it('measures the real services and Electron entry without using user data', async () => {
    const report = {
      conditions: {
        fixture: 'deterministic-v1',
        runsPerMetric: runs,
        source: 'generated temporary workspace and test userData only',
        startupCache: 'process-cold; OS filesystem cache not purged',
      },
      generatedAt: new Date().toISOString(),
      label,
      scales: {} as Record<string, ScaleResult>,
      system: systemDetails(),
    }

    for (const size of sizes) {
      const temporaryRoot = await mkdtemp(join(process.env.TMPDIR ?? '/tmp', `awb-perf-${size}-`))
      temporaryRoots.push(temporaryRoot)
      const workspacePath = join(temporaryRoot, 'workspace')
      const userDataPath = join(temporaryRoot, 'user-data')
      await mkdir(workspacePath, { recursive: true })
      await mkdir(userDataPath, { recursive: true })
      const fixture = await createPerformanceWorkspace(workspacePath, size)

      const databaseInit = await repeat(async () => {
        const initPath = await mkdtemp(join(temporaryRoot, 'db-init-'))
        const initDatabase = createAppDatabase(initPath)
        initDatabase.close()
        await rm(initPath, { force: true, recursive: true })
      })

      const database = createAppDatabase(userDataPath)
      const workspaceRepository = new WorkspaceRepository(database)
      const workspace = workspaceRepository.upsertWorkspace(
        workspacePath,
        `Performance fixture ${size}`,
      )
      workspaceRepository.setActiveWorkspace(workspace.id)
      const initialScan = await measure(() => scanTemplateWorkspace(workspacePath, workspace.id))
      workspaceRepository.replaceTemplates(
        workspace.id,
        initialScan.value.templates,
        initialScan.value.summary,
        new Date().toISOString(),
      )
      const templates = workspaceRepository.listTemplates(workspace.id)
      await seedPerformanceDatabase({
        database,
        fixture,
        templates,
        userDataPath,
        workspaceId: workspace.id,
      })
      const problemRepository = new ProblemRepository(database)
      const metadataRepository = new TemplateManagementRepository(database)
      const contextService = new WorkspaceAiContextService(
        workspaceRepository,
        metadataRepository,
        problemRepository,
      )
      const auditService = createAuditService({
        metadataRepository,
        userDataPath,
        workspaceAiContextService: contextService,
        workspaceRepository,
      })

      const firstScan = await repeat(async () => {
        const firstUserDataPath = await mkdtemp(join(temporaryRoot, 'first-scan-'))
        const firstDatabase = createAppDatabase(firstUserDataPath)
        try {
          const firstRepository = new WorkspaceRepository(firstDatabase)
          const firstWorkspace = firstRepository.upsertWorkspace(
            workspacePath,
            `Performance fixture ${size}`,
          )
          firstRepository.setActiveWorkspace(firstWorkspace.id)
          const value = await scanTemplateWorkspace(workspacePath, firstWorkspace.id)
          firstRepository.replaceTemplates(
            firstWorkspace.id,
            value.templates,
            value.summary,
            new Date().toISOString(),
          )
        } finally {
          firstDatabase.close()
          await rm(firstUserDataPath, { force: true, recursive: true })
        }
      })
      const fullScan = await repeat(async () => {
        const value = await scanTemplateWorkspace(workspacePath, workspace.id)
        workspaceRepository.replaceTemplates(
          workspace.id,
          value.templates,
          value.summary,
          new Date().toISOString(),
        )
      })
      const noChangeRescan = await repeat(async () => {
        const value = await scanTemplateWorkspace(workspacePath, workspace.id)
        workspaceRepository.replaceTemplates(
          workspace.id,
          value.templates,
          value.summary,
          new Date().toISOString(),
        )
      })
      const treeBuild = await repeat(() => buildTemplateTree(templates))
      const treeExpand = await repeat(() => {
        const root = buildTemplateTree(templates)
        return flattenTemplateTree(root, getDirectoryRowIds(root))
      })
      const treeSearchLocate = await repeat(() => {
        const root = buildTemplateTree(templates)
        const query = `template_${Math.floor(size * 0.9)
          .toString()
          .padStart(5, '0')
          .slice(0, 3)}`
        const matches = templates.filter(template =>
          `${template.name} ${template.relativePath}`.toLocaleLowerCase().includes(query),
        )
        return matches[0] ? getExpansionIdsForTemplate(root, matches[0]) : []
      })
      const problemList = await repeat(() => problemRepository.listProblems())
      const problemId = problemRepository.listProblems()[Math.floor(fixture.problemCount / 2)]!.id
      const problemDetail = await repeat(() => problemRepository.getProblem(problemId))
      const sourceAudit = await repeat(() => auditService.auditWorkspace())
      const aiCandidateRetrieval = await repeat(() =>
        contextService.build({
          model: 'fixture-model',
          outputLanguage: 'zh-CN',
          promptSchemaVersion: 'performance-v1',
          providerId: 'fixture-provider',
          query: '最短路 图论 数据结构 区间查询',
          task: 'problem-image-analysis',
        }),
      )
      database.close()
      const appStartup = await repeatSamples(() => electronStartup(userDataPath))

      report.scales[String(size)] = {
        counts: {
          images: fixture.imageCount,
          problems: fixture.problemCount,
          relations: fixture.relationCount,
          templates: fixture.templateCount,
        },
        metrics: {
          aiCandidateRetrieval,
          appStartup,
          cancellation: null,
          databaseInit,
          firstScan,
          fullScan,
          noChangeRescan,
          problemDetail,
          problemList,
          sourceAudit,
          treeBuild,
          treeExpand,
          treeSearchLocate,
        },
      }
    }

    await mkdir(reportRoot, { recursive: true })
    await writeFile(
      join(reportRoot, `session-e-${label}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    )
    await writeFile(join(reportRoot, `session-e-${label}.md`), markdownReport(report), 'utf8')
    expect(Object.keys(report.scales)).toEqual(sizes.map(String))
  })
})

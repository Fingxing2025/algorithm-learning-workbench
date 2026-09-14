import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  FolderSearch,
  LoaderCircle,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { AiRequestPreview } from '@core/contracts/ai-request'
import type { BackgroundTaskStatus } from '@core/contracts/background-task'
import type {
  ApplyBatchTemplateStagingResult,
  ApplyStagingAiPlanResult,
  BatchImportTemplateResult,
  BatchTemplateStaging,
  BatchTemplateStagingItem,
  BatchTemplateImportConflict,
  BatchTemplateImportSource,
  TemplateClassification,
  TemplateMetadataLanguage,
  StagingAiPlanDraft,
  StagingAiPlanPreview,
} from '@core/contracts/template-management'

import { AiRequestPreviewDialog } from '@/components/ai-request-preview-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TaskProgressIndicator } from '@/components/task-progress-indicator'
import { runTrackedOperation } from '@/lib/background-task'
import { useI18n } from '@/lib/i18n'

import { emptyTemplateMetadata } from './template-metadata-merge'
import { formatTemplateSourceEncoding } from './template-source-encoding'

type BusyMode = 'choose' | 'classify' | 'import' | 'preview' | 'ai-plan' | null
type ConflictChoice = 'overwrite' | 'rename' | 'skip'
type ImportFlow = 'legacy' | 'staging' | null
type StagingAction =
  'apply' | 'create' | 'discard' | 'load' | 'process' | 'update' | 'ai-plan' | null

/**
 * Old preloads deliberately do not expose staging. Keep the renderer compatible
 * with those installations and with focused component tests that only mock the
 * legacy batch API.
 */
type BatchStagingApi = {
  applyBatchStaging?: (request: {
    confirmed: true
    stagingId: string
  }) => Promise<ApplyBatchTemplateStagingResult>
  applyBatchStagingAiPlan?: (request: {
    confirmed: true
    draftId: string
    operationIds: string[]
  }) => Promise<ApplyStagingAiPlanResult>
  continueBatchStaging?: (request: {
    requestId?: string
    runAi: boolean
    stagingId: string
  }) => Promise<BatchTemplateStaging>
  previewBatchStagingClassification?: (request: {
    outputLanguage: TemplateMetadataLanguage
    sources: BatchTemplateImportSource[]
    stagingId: string
  }) => Promise<AiRequestPreview>
  createBatchStaging?: (request: {
    outputLanguage: TemplateMetadataLanguage
    sources: BatchTemplateImportSource[]
  }) => Promise<BatchTemplateStaging>
  discardBatchStaging?: (request: { confirmed: true; stagingId: string }) => Promise<void>
  getBatchStaging?: (request: { stagingId: string }) => Promise<BatchTemplateStaging | null>
  listBatchStagings?: () => Promise<BatchTemplateStaging[]>
  retryBatchStaging?: (request: {
    requestId?: string
    runAi: boolean
    stagingId: string
  }) => Promise<BatchTemplateStaging>
  updateBatchStagingItem?: (request: {
    action: 'include' | 'skip'
    sourceId: string
    stagingId: string
    targetRelativePath: string | null
  }) => Promise<BatchTemplateStaging>
  previewBatchStagingAiPlan?: (request: {
    includeNotes: boolean
    outputLanguage: TemplateMetadataLanguage
    requestId: string
    stagingId: string
    target: 'staging'
  }) => Promise<StagingAiPlanPreview>
  generateBatchStagingAiPlan?: (request: {
    previewId: string
    requestId: string
  }) => Promise<StagingAiPlanDraft>
  cancelBatchStagingAiPlan?: (requestId: string) => Promise<void>
}

type BatchSourceView = BatchTemplateImportSource & { contentAvailable?: boolean }

const sessionLabels = {
  processing: '暂存中',
  failed: '暂存失败，可重试',
  ready: '暂存就绪，待确认',
  applying: '正在应用暂存',
  applied: '暂存已应用',
  discarded: '暂存已放弃',
} as const
const itemLabels = {
  pending: '等待处理',
  processing: '正在处理',
  completed: '已暂存（分类待确认）',
  failed: '处理失败',
  skipped: '已跳过',
} as const

const stagingStatuses = new Set<BatchTemplateStaging['status']>(['processing', 'failed', 'ready'])

function stagingApi(): BatchStagingApi {
  return window.desktop.templateManagement as unknown as BatchStagingApi
}

function supportsStaging(api: BatchStagingApi): boolean {
  return (
    typeof api.applyBatchStaging === 'function' &&
    typeof api.continueBatchStaging === 'function' &&
    typeof api.createBatchStaging === 'function' &&
    typeof api.discardBatchStaging === 'function' &&
    typeof api.updateBatchStagingItem === 'function'
  )
}

function isStagingIpcUnavailable(caught: unknown): boolean {
  const message = caught instanceof Error ? caught.message : String(caught ?? '')
  return /no handler registered|unknown channel|channel.*(?:not found|unavailable)|not implemented|not a function|unsupported.*staging|staging.*unsupported/i.test(
    message,
  )
}

function sourceViewFromStagingItem(item: BatchTemplateStagingItem): BatchSourceView {
  return {
    content: '',
    contentAvailable: false,
    displayPath: item.displayPath,
    fileName: item.fileName,
    id: item.sourceId,
    sourceEncoding: item.sourceEncoding,
  }
}

const conflictMessages: Record<BatchTemplateImportConflict['kind'], string> = {
  'batch-duplicate': '本批次中有多个模板使用相同目标路径，请跳过或修改文件名。',
  'case-conflict': '目标路径与已有文件仅大小写不同，请跳过或修改文件名。',
  'existing-directory': '目标路径已被文件夹占用，请跳过或修改文件名。',
  'existing-file': '目标文件已经存在，请选择覆盖、不加入或修改文件名。',
  'existing-special': '目标路径不是可覆盖的普通文件，请跳过或修改文件名。',
}

export function BatchTemplateImportDialog({
  onComplete,
  onOpenChange,
  onStagingApplied,
  open,
}: {
  onComplete: (result: BatchImportTemplateResult) => void
  onOpenChange: (open: boolean) => void
  onStagingApplied?: (result: ApplyBatchTemplateStagingResult) => void
  open: boolean
}) {
  const { locale, t } = useI18n()
  const [busyMode, setBusyMode] = useState<BusyMode>(null)
  const [taskStatus, setTaskStatus] = useState<BackgroundTaskStatus | null>(null)
  const cancelRequested = useRef(false)
  const activeClassificationRequestId = useRef<string | null>(null)
  const [classifications, setClassifications] = useState<Record<string, TemplateClassification>>({})
  const [conflictChoices, setConflictChoices] = useState<Record<string, ConflictChoice>>({})
  const [conflicts, setConflicts] = useState<BatchTemplateImportConflict[]>([])
  const [error, setError] = useState<string | null>(null)
  const [outputLanguage, setOutputLanguage] = useState<TemplateMetadataLanguage>(locale)
  const [preview, setPreview] = useState<AiRequestPreview | null>(null)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [sources, setSources] = useState<BatchSourceView[]>([])
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set())
  const [importFlow, setImportFlow] = useState<ImportFlow>(null)
  const [staging, setStaging] = useState<BatchTemplateStaging | null>(null)
  const [stagingAction, setStagingAction] = useState<StagingAction>(null)
  const [stagingLoading, setStagingLoading] = useState(false)
  const [stagingSessions, setStagingSessions] = useState<BatchTemplateStaging[]>([])
  const [stagingAiPreview, setStagingAiPreview] = useState<StagingAiPlanPreview | null>(null)
  const [stagingAiDraft, setStagingAiDraft] = useState<StagingAiPlanDraft | null>(null)
  const [stagingAiRequestId, setStagingAiRequestId] = useState<string | null>(null)
  const [selectedStagingAiOperationIds, setSelectedStagingAiOperationIds] = useState<Set<string>>(
    new Set(),
  )
  const [targetPaths, setTargetPaths] = useState<Record<string, string>>({})
  const activeStagingRequestId = useRef<string | null>(null)
  const liveHydratedProcessedCount = useRef(0)
  const syncedStagingItems = useRef<Record<string, string>>({})
  const closingStagingId = useRef<string | null>(null)

  const selectedSources = useMemo(
    () => sources.filter(source => selectedSourceIds.has(source.id)),
    [selectedSourceIds, sources],
  )
  const selectedSourcePayload = useMemo(
    () =>
      selectedSources.map(source => ({
        content: source.content,
        displayPath: source.displayPath,
        fileName: source.fileName,
        id: source.id,
        sourceEncoding: source.sourceEncoding,
      })),
    [selectedSources],
  )
  const completedCount = selectedSources.filter(source => classifications[source.id]).length
  const importSources = selectedSources.filter(source => conflictChoices[source.id] !== 'skip')
  const unresolvedConflicts = conflicts.filter(conflict => {
    if (!selectedSourceIds.has(conflict.sourceId)) return false
    const choice = conflictChoices[conflict.sourceId]
    if (choice === 'skip') return false
    if (choice === 'overwrite' && conflict.canOverwrite) return false
    return !(choice === 'rename' && targetPaths[conflict.sourceId] !== conflict.relativePath)
  })
  const readyToImport =
    importSources.length > 0 &&
    unresolvedConflicts.length === 0 &&
    importSources.every(source => targetPaths[source.id]?.trim())
  const totalCharacters = useMemo(
    () => selectedSources.reduce((total, source) => total + source.content.length, 0),
    [selectedSources],
  )
  const stagingIncludedItems = useMemo(
    () => staging?.items.filter(item => item.status !== 'skipped') ?? [],
    [staging],
  )
  const stagingReadyToApply =
    staging?.status === 'ready' &&
    stagingIncludedItems.length > 0 &&
    stagingIncludedItems.every(
      item => item.status === 'completed' && Boolean(item.targetRelativePath),
    )

  const hydrateStaging = (nextStaging: BatchTemplateStaging) => {
    setStaging(nextStaging)
    setStagingSessions(current =>
      current.some(session => session.id === nextStaging.id)
        ? current.map(session => (session.id === nextStaging.id ? nextStaging : session))
        : current,
    )
    setTargetPaths(
      Object.fromEntries(
        nextStaging.items.map(item => [item.sourceId, item.targetRelativePath ?? item.displayPath]),
      ),
    )
    setClassifications(
      Object.fromEntries(
        nextStaging.items
          .filter(
            (item): item is BatchTemplateStagingItem & { classification: TemplateClassification } =>
              Boolean(item.classification),
          )
          .map(item => [item.sourceId, item.classification]),
      ),
    )
    setSelectedSourceIds(
      new Set(
        nextStaging.items.filter(item => item.status !== 'skipped').map(item => item.sourceId),
      ),
    )
    setProgress({ completed: nextStaging.processedCount, total: nextStaging.totalCount })
    syncedStagingItems.current = Object.fromEntries(
      nextStaging.items.map(item => [
        item.sourceId,
        item.status === 'skipped' ? 'skip:' : `include:${item.targetRelativePath ?? ''}`,
      ]),
    )
    setSources(current => {
      const known = new Map(current.map(source => [source.id, source]))
      return nextStaging.items
        .slice()
        .sort((left, right) => left.ordinal - right.ordinal)
        .map(item => known.get(item.sourceId) ?? sourceViewFromStagingItem(item))
    })
  }

  const setStagingError = (caught: unknown, fallback: string) => {
    setError(caught instanceof Error ? caught.message : fallback)
  }

  const discardStaging = async (closeAfter = true, stagingToDiscard = staging) => {
    const currentStaging = stagingToDiscard
    const api = stagingApi()
    if (
      !currentStaging ||
      currentStaging.status === 'discarded' ||
      currentStaging.status === 'applied' ||
      typeof api.discardBatchStaging !== 'function'
    ) {
      if (closeAfter) onOpenChange(false)
      return
    }
    if (closingStagingId.current === currentStaging.id) return
    closingStagingId.current = currentStaging.id
    setStagingAction('discard')
    setError(null)
    try {
      await api.discardBatchStaging({ confirmed: true, stagingId: currentStaging.id })
      setStagingSessions(current => current.filter(item => item.id !== currentStaging.id))
      setStaging(null)
      setSources([])
      setSelectedSourceIds(new Set())
      setClassifications({})
      setTargetPaths({})
      setProgress({ completed: 0, total: 0 })
      if (closeAfter) onOpenChange(false)
    } catch (caught) {
      setStagingError(caught, t('暂存批次未能放弃，当前工作区未改变。'))
    } finally {
      closingStagingId.current = null
      setStagingAction(null)
    }
  }

  const requestClose = () => {
    if (stagingAction) return
    cancelRequested.current = true
    const pendingId = activeStagingRequestId.current ?? activeClassificationRequestId.current
    if (pendingId) void window.desktop.templateManagement.cancelClassification(pendingId)
    activeStagingRequestId.current = null
    if (stagingAiRequestId) void stagingApi().cancelBatchStagingAiPlan?.(stagingAiRequestId)
    // Closing (Escape, overlay, or the header X) only hides the dialog.  A
    // staging session is durable and must remain resumable; deletion is
    // reserved for the explicit “放弃暂存” action in the footer/session list.
    onOpenChange(false)
  }

  useEffect(() => {
    if (open) {
      return
    }
    cancelRequested.current = false
    setBusyMode(null)
    setTaskStatus(null)
    setClassifications({})
    setConflictChoices({})
    setConflicts([])
    setError(null)
    setOutputLanguage(locale)
    setPreview(null)
    setProgress({ completed: 0, total: 0 })
    setSources([])
    setSelectedSourceIds(new Set())
    setImportFlow(null)
    setStaging(null)
    setStagingAction(null)
    setStagingLoading(false)
    setStagingSessions([])
    setStagingAiPreview(null)
    setStagingAiDraft(null)
    setStagingAiRequestId(null)
    setSelectedStagingAiOperationIds(new Set())
    setTargetPaths({})
    activeStagingRequestId.current = null
    liveHydratedProcessedCount.current = 0
    syncedStagingItems.current = {}
    closingStagingId.current = null
  }, [locale, open])

  useEffect(() => {
    if (!open) return
    let disposed = false
    const api = stagingApi()
    if (!supportsStaging(api)) {
      setImportFlow('legacy')
      return
    }
    setImportFlow('staging')
    setStagingLoading(true)
    setError(null)
    const load = async () => {
      try {
        const sessions = api.listBatchStagings ? await api.listBatchStagings() : []
        if (disposed) return
        setStagingSessions(sessions.filter(session => stagingStatuses.has(session.status)))
      } catch (caught) {
        if (disposed) return
        // A pre-staging main process may expose the methods in the preload but
        // not have registered their channels yet. In that case retain the old
        // path so an existing installation remains usable.
        if (isStagingIpcUnavailable(caught)) setImportFlow('legacy')
        else setError(t('无法读取可恢复的暂存批次。'))
        setStagingSessions([])
      } finally {
        if (!disposed) setStagingLoading(false)
      }
    }
    void load()
    return () => {
      disposed = true
    }
  }, [open, t])

  const replaceSources = (nextSources: BatchTemplateImportSource[]) => {
    if (nextSources.length === 0) return
    setSources(nextSources.map(source => ({ ...source, contentAvailable: true })))
    setStaging(null)
    setClassifications({})
    setConflictChoices({})
    setConflicts([])
    setSelectedSourceIds(new Set(nextSources.map(source => source.id)))
    setTargetPaths(Object.fromEntries(nextSources.map(source => [source.id, source.displayPath])))
    setProgress({ completed: 0, total: nextSources.length })
  }

  const createStaging = async (nextSources: BatchTemplateImportSource[]) => {
    const api = stagingApi()
    // The caller sets `importFlow` immediately before invoking this helper.
    // React state updates are asynchronous, so checking the captured
    // `importFlow` value here can incorrectly no-op on the first source
    // selection while the value is still `null`.  The caller already gates
    // this path on staging support; only the capability check belongs here.
    if (typeof api.createBatchStaging !== 'function') return false
    setStagingAction('create')
    try {
      const nextStaging = await api.createBatchStaging({
        outputLanguage,
        sources: nextSources,
      })
      hydrateStaging(nextStaging)
      setStagingSessions(current => [
        nextStaging,
        ...current.filter(session => session.id !== nextStaging.id),
      ])
      return true
    } catch (caught) {
      // Keep the old flow available when a renderer is paired with a main
      // process that predates the staging IPC channels.
      if (isStagingIpcUnavailable(caught)) setImportFlow('legacy')
      setStaging(null)
      setStagingError(caught, t('暂存批次创建失败，尚未写入当前工作区。'))
      return false
    } finally {
      setStagingAction(null)
    }
  }

  const resumeStaging = async (session: BatchTemplateStaging) => {
    const api = stagingApi()
    setStagingAction('load')
    setError(null)
    try {
      const latest = api.getBatchStaging
        ? await api.getBatchStaging({ stagingId: session.id })
        : session
      if (!latest) {
        setStagingSessions(current => current.filter(item => item.id !== session.id))
        setError(t('暂存批次已不存在，请重新选择源码。'))
        return
      }
      setImportFlow('staging')
      hydrateStaging(latest)
    } catch (caught) {
      setStagingError(caught, t('无法恢复暂存批次，当前工作区未改变。'))
    } finally {
      setStagingAction(null)
    }
  }

  const persistStagingItem = async (
    sourceId: string,
    action: 'include' | 'skip',
    targetRelativePath: string | null,
  ) => {
    const currentStaging = staging
    const api = stagingApi()
    if (
      importFlow !== 'staging' ||
      !currentStaging ||
      typeof api.updateBatchStagingItem !== 'function'
    ) {
      return
    }
    const normalizedTarget = action === 'skip' ? null : targetRelativePath?.trim() || null
    if (action === 'include' && !normalizedTarget) {
      setError(t('工作区保存路径不能为空。'))
      return
    }
    const signature = `${action}:${normalizedTarget ?? ''}`
    if (syncedStagingItems.current[sourceId] === signature) return
    setStagingAction('update')
    setError(null)
    try {
      const nextStaging = await api.updateBatchStagingItem({
        action,
        sourceId,
        stagingId: currentStaging.id,
        targetRelativePath: normalizedTarget,
      })
      hydrateStaging(nextStaging)
    } catch (caught) {
      setStagingError(caught, t('暂存项更新失败，当前工作区未改变。'))
    } finally {
      setStagingAction(null)
    }
  }

  const flushStagingItems = async () => {
    const currentStaging = staging
    const api = stagingApi()
    if (
      importFlow !== 'staging' ||
      !currentStaging ||
      typeof api.updateBatchStagingItem !== 'function'
    ) {
      return currentStaging
    }
    let latest = currentStaging
    for (const item of currentStaging.items) {
      const selected = selectedSourceIds.has(item.sourceId)
      const target = selected ? targetPaths[item.sourceId]?.trim() || null : null
      const action = selected ? 'include' : 'skip'
      // A newly-created item has no persisted target yet.  The input shows
      // its display path as a provisional value, but that value must not be
      // flushed before an AI run: doing so would make process() treat it as a
      // user-confirmed path and ignore the classifier's suggested location.
      // An explicit blur/edit still goes through persistStagingItem and is
      // therefore retained normally.
      if (item.targetRelativePath === null && target === item.displayPath) continue
      const signature = `${action}:${target ?? ''}`
      if (syncedStagingItems.current[item.sourceId] === signature) continue
      if (action === 'include' && !target) {
        setError(t('工作区保存路径不能为空。'))
        return null
      }
      try {
        latest = await api.updateBatchStagingItem({
          action,
          sourceId: item.sourceId,
          stagingId: currentStaging.id,
          targetRelativePath: target,
        })
        hydrateStaging(latest)
      } catch (caught) {
        setStagingError(caught, t('暂存项更新失败，当前工作区未改变。'))
        return null
      }
    }
    return latest
  }

  const persistAllStagingSelections = async (action: 'include' | 'skip') => {
    if (importFlow !== 'staging' || !staging) return
    for (const source of sources) {
      await persistStagingItem(
        source.id,
        action,
        action === 'include' ? (targetPaths[source.id] ?? source.displayPath) : null,
      )
    }
  }

  const processStaging = async (runAi: boolean, retry = false) => {
    const currentStaging = staging
    const api = stagingApi()
    const process = retry
      ? (api.retryBatchStaging ?? api.continueBatchStaging)
      : api.continueBatchStaging
    if (importFlow !== 'staging' || !currentStaging || typeof process !== 'function') {
      return
    }
    const flushed = await flushStagingItems()
    if (!flushed) return
    setPreview(null)
    setBusyMode(runAi ? 'classify' : 'import')
    setError(null)
    cancelRequested.current = false
    const requestId = crypto.randomUUID()
    activeStagingRequestId.current = requestId
    liveHydratedProcessedCount.current = currentStaging.processedCount
    const startedAt = new Date().toISOString()
    setTaskStatus({
      error: null,
      finishedAt: null,
      id: requestId,
      kind: 'batch-operation',
      progress: {
        currentItem: currentStaging.currentItem,
        phase: runAi ? 'requesting-ai' : 'writing',
        processedCount: currentStaging.processedCount,
        totalCount: currentStaging.totalCount,
      },
      result: null,
      startedAt,
      state: 'running',
    })
    try {
      const nextStaging = await runTrackedOperation(
        requestId,
        () =>
          process({
            requestId,
            runAi,
            stagingId: currentStaging.id,
          }),
        status => {
          if (activeStagingRequestId.current !== requestId) return
          setTaskStatus(status)
          setProgress({
            completed: status.progress.processedCount,
            total: status.progress.totalCount ?? currentStaging.totalCount,
          })
          const completed = status.progress.processedCount
          if (
            completed > liveHydratedProcessedCount.current &&
            typeof api.getBatchStaging === 'function'
          ) {
            liveHydratedProcessedCount.current = completed
            void api
              .getBatchStaging({ stagingId: currentStaging.id })
              .then(latest => {
                // Multiple progress polls can overlap. Never let a slower,
                // older snapshot hide a classification already rendered by
                // a newer completed-item refresh.
                if (
                  latest &&
                  latest.processedCount >= liveHydratedProcessedCount.current &&
                  activeStagingRequestId.current === requestId
                ) {
                  hydrateStaging(latest)
                }
              })
              .catch(() => {
                // The final business response (or cancellation recovery
                // refresh) remains authoritative if this best-effort live
                // card refresh fails.
              })
          }
        },
      )
      if (activeStagingRequestId.current !== requestId) return
      if (cancelRequested.current) {
        setError(
          t(runAi ? '批量 AI 补全已停止；暂存批次仍可继续。' : '暂存批次处理已停止；仍可继续。'),
        )
      }
      hydrateStaging(nextStaging)
      if (nextStaging.status === 'failed') {
        setError(nextStaging.error ?? t('暂存批次处理失败，暂未写入当前工作区。'))
      }
    } catch (caught) {
      if (activeStagingRequestId.current !== requestId) return
      setStagingError(
        caught,
        cancelRequested.current
          ? t(runAi ? '批量 AI 补全已停止；暂存批次仍可继续。' : '暂存批次处理已停止；仍可继续。')
          : t('暂存批次处理失败，暂未写入当前工作区。'),
      )
      if (api.getBatchStaging) {
        try {
          const latest = await api.getBatchStaging({ stagingId: currentStaging.id })
          if (latest && activeStagingRequestId.current === requestId) hydrateStaging(latest)
        } catch {
          // Keep the original processing error visible when the refresh also fails.
        }
      }
    } finally {
      if (activeStagingRequestId.current === requestId) {
        activeStagingRequestId.current = null
        setBusyMode(null)
        setTaskStatus(null)
      }
    }
  }

  const previewStagingAiPlan = async () => {
    const currentStaging = staging
    const api = stagingApi()
    if (
      importFlow !== 'staging' ||
      !currentStaging ||
      currentStaging.status !== 'ready' ||
      typeof api.previewBatchStagingAiPlan !== 'function'
    )
      return
    setStagingAction('ai-plan')
    setError(null)
    try {
      const requestId = crypto.randomUUID()
      setStagingAiRequestId(requestId)
      setStagingAiPreview(
        await api.previewBatchStagingAiPlan({
          includeNotes: false,
          outputLanguage,
          requestId,
          stagingId: currentStaging.id,
          target: 'staging',
        }),
      )
    } catch (caught) {
      setStagingAiRequestId(null)
      setStagingError(caught, t('无法准备暂存区 AI 整理预览。'))
    } finally {
      setStagingAction(null)
    }
  }

  const generateStagingAiPlan = async () => {
    const api = stagingApi()
    if (
      !stagingAiPreview ||
      !stagingAiRequestId ||
      typeof api.generateBatchStagingAiPlan !== 'function'
    )
      return
    setBusyMode('ai-plan')
    setStagingAiPreview(null)
    setError(null)
    try {
      const draft = await runTrackedOperation(
        stagingAiRequestId,
        () =>
          api.generateBatchStagingAiPlan!({
            previewId: stagingAiPreview.filePlan.previewId,
            requestId: stagingAiRequestId,
          }),
        setTaskStatus,
      )
      const selectable = draft.operations.filter(operation => operation.kind !== 'update-metadata')
      setStagingAiDraft(draft)
      setSelectedStagingAiOperationIds(
        new Set(
          selectable
            .filter(operation => operation.selectedByDefault)
            .map(operation => operation.id),
        ),
      )
      setStagingAiRequestId(null)
    } catch (caught) {
      setStagingAiRequestId(null)
      setStagingError(caught, t('暂存区 AI 计划生成失败，暂存内容未改变。'))
    } finally {
      setBusyMode(null)
      setTaskStatus(null)
    }
  }

  const applyStagingAiPlan = async () => {
    const api = stagingApi()
    if (
      !stagingAiDraft ||
      selectedStagingAiOperationIds.size === 0 ||
      typeof api.applyBatchStagingAiPlan !== 'function'
    )
      return
    setStagingAction('ai-plan')
    setError(null)
    try {
      const result = await api.applyBatchStagingAiPlan({
        confirmed: true,
        draftId: stagingAiDraft.draftId,
        operationIds: [...selectedStagingAiOperationIds],
      })
      hydrateStaging(result.staging)
      setStagingAiDraft(null)
      setSelectedStagingAiOperationIds(new Set())
      setError(null)
    } catch (caught) {
      setStagingError(caught, t('暂存区 AI 整理应用失败，当前工作区未改变。'))
    } finally {
      setStagingAction(null)
    }
  }

  const applyStaging = async () => {
    const currentStaging = staging
    const api = stagingApi()
    if (
      importFlow !== 'staging' ||
      !currentStaging ||
      currentStaging.status !== 'ready' ||
      typeof api.applyBatchStaging !== 'function'
    ) {
      return
    }
    const flushed = await flushStagingItems()
    if (!flushed || flushed.status !== 'ready') {
      if (flushed && flushed.status !== 'ready') {
        setError(t('暂存批次状态已变化，请重新检查后再应用。'))
      }
      return
    }
    setBusyMode('import')
    setStagingAction('apply')
    setError(null)
    try {
      const result = await api.applyBatchStaging({
        confirmed: true,
        stagingId: currentStaging.id,
      })
      setStaging({ ...currentStaging, status: 'applied' })
      onStagingApplied?.(result)
      // A consumer which has not opted into the staging callback can still
      // close the dialog safely. No template IDs are fabricated here.
      if (!onStagingApplied) onOpenChange(false)
      if (!result.workspace) setStaging(null)
    } catch (caught) {
      setStagingError(caught, t('暂存批次应用失败，当前工作区已保持不变。'))
    } finally {
      setBusyMode(null)
      setStagingAction(null)
    }
  }

  const chooseSources = async (kind: 'directory' | 'files') => {
    setBusyMode('choose')
    setError(null)
    const startedAt = new Date().toISOString()
    setTaskStatus({
      error: null,
      finishedAt: null,
      id: crypto.randomUUID(),
      kind: 'batch-operation',
      progress: {
        currentItem: kind === 'files' ? t('多个 C++ 文件') : t('C++ 文件夹'),
        phase: 'discovering',
        processedCount: 0,
        totalCount: null,
      },
      result: null,
      startedAt,
      state: 'running',
    })
    try {
      const nextSources =
        kind === 'files'
          ? await window.desktop.templateManagement.chooseBatchImportFiles()
          : await window.desktop.templateManagement.chooseBatchImportDirectory()
      replaceSources(nextSources)
      const api = stagingApi()
      if ((importFlow === 'staging' || importFlow === null) && supportsStaging(api)) {
        setImportFlow('staging')
        await createStaging(nextSources)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('无法读取批量 C++ 源码。'))
    } finally {
      setBusyMode(null)
      setTaskStatus(null)
    }
  }

  const previewClassification = async () => {
    const api = stagingApi()
    setBusyMode('preview')
    setError(null)
    const startedAt = new Date().toISOString()
    setTaskStatus({
      error: null,
      finishedAt: null,
      id: crypto.randomUUID(),
      kind: 'batch-operation',
      progress: {
        currentItem: null,
        phase: 'preparing',
        processedCount: 0,
        totalCount: selectedSources.length,
      },
      result: null,
      startedAt,
      state: 'running',
    })
    try {
      if (importFlow === 'staging' && staging) {
        if (selectedSources.some(source => source.contentAvailable === false)) {
          throw new Error(t('恢复的暂存批次没有可供页面预览的源码；可直接继续处理。'))
        }
        // The staging preview is read-only. The actual network operation is
        // still started only by processStaging after the user confirms it.
        if (typeof api.previewBatchStagingClassification === 'function') {
          setPreview(
            await api.previewBatchStagingClassification({
              outputLanguage,
              sources: selectedSourcePayload,
              stagingId: staging.id,
            }),
          )
          return
        }
        // Older staging preloads did not expose a branch-aware preview. Keep
        // their read-only legacy preview as a compatibility fallback; current
        // desktop builds always take the branch-aware method above.
      }
      setPreview(
        await window.desktop.templateManagement.previewBatchClassification({
          outputLanguage,
          sources: selectedSourcePayload,
        }),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('无法准备批量 AI 发送预览。'))
    } finally {
      setBusyMode(null)
      setTaskStatus(null)
    }
  }

  const classifyAll = async () => {
    setPreview(null)
    setBusyMode('classify')
    setError(null)
    setClassifications({})
    setConflictChoices({})
    setConflicts([])
    setProgress({ completed: 0, total: selectedSources.length })
    cancelRequested.current = false
    const taskId = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    setTaskStatus({
      error: null,
      finishedAt: null,
      id: taskId,
      kind: 'batch-operation',
      progress: {
        currentItem: selectedSources[0]?.displayPath ?? null,
        phase: 'requesting-ai',
        processedCount: 0,
        totalCount: selectedSources.length,
      },
      result: null,
      startedAt,
      state: 'running',
    })
    try {
      for (let index = 0; index < selectedSources.length; index += 1) {
        if (cancelRequested.current) {
          setError(t('批量 AI 补全已停止；尚未向工作区写入文件。'))
          return
        }
        const source = selectedSources[index]!
        setTaskStatus(current =>
          current
            ? {
                ...current,
                progress: {
                  currentItem: source.displayPath,
                  phase: 'requesting-ai',
                  processedCount: index,
                  totalCount: selectedSources.length,
                },
              }
            : current,
        )
        const requestId = crypto.randomUUID()
        activeClassificationRequestId.current = requestId
        const result = await window.desktop.templateManagement.classify({
          content: source.content,
          fileName: source.fileName,
          metadata: emptyTemplateMetadata,
          outputLanguage,
          requestId,
        })
        if (cancelRequested.current || activeClassificationRequestId.current !== requestId) {
          setError(t('批量 AI 补全已停止；尚未向工作区写入文件。'))
          return
        }
        activeClassificationRequestId.current = null
        setClassifications(current => ({ ...current, [source.id]: result }))
        setTargetPaths(current => ({ ...current, [source.id]: result.suggestedRelativePath }))
        setProgress({ completed: index + 1, total: selectedSources.length })
        setTaskStatus(current =>
          current
            ? {
                ...current,
                progress: {
                  currentItem: source.displayPath,
                  phase: 'processing',
                  processedCount: index + 1,
                  totalCount: selectedSources.length,
                },
              }
            : current,
        )
      }
    } catch (caught) {
      setError(
        cancelRequested.current
          ? t('批量 AI 补全已停止；尚未向工作区写入文件。')
          : caught instanceof Error
            ? caught.message
            : t('批量 AI 元数据补全未完成；尚未向工作区写入文件。'),
      )
    } finally {
      activeClassificationRequestId.current = null
      setBusyMode(null)
      setTaskStatus(null)
    }
  }

  const importAll = async () => {
    if (importFlow === 'staging' && staging) {
      if (staging.status === 'ready') {
        await applyStaging()
      } else {
        await processStaging(false, staging.status === 'failed')
      }
      return
    }
    if (!readyToImport) return
    setBusyMode('import')
    setError(null)
    setTaskStatus(null)
    try {
      const candidates = selectedSources.filter(source => conflictChoices[source.id] !== 'skip')
      const inspection = await window.desktop.templateManagement.inspectBatchImport({
        items: candidates.map(source => ({
          relativePath: targetPaths[source.id]!,
          sourceId: source.id,
        })),
      })
      const previousConflicts = conflicts
      setConflicts(inspection.conflicts)
      const inspectedBySource = new Map(
        inspection.conflicts.map(conflict => [conflict.sourceId, conflict]),
      )
      const staleOverwriteIds = candidates
        .filter(source => {
          if (conflictChoices[source.id] !== 'overwrite') return false
          const currentConflict = inspectedBySource.get(source.id)
          const previousConflict = previousConflicts.find(
            conflict => conflict.sourceId === source.id,
          )
          return (
            !currentConflict?.canOverwrite ||
            !previousConflict?.canOverwrite ||
            currentConflict.existingFileState !== previousConflict.existingFileState
          )
        })
        .map(source => source.id)
      if (staleOverwriteIds.length > 0) {
        setConflictChoices(current => {
          const next = { ...current }
          for (const sourceId of staleOverwriteIds) delete next[sourceId]
          return next
        })
        setError(t('待覆盖文件状态已变化，请重新选择处理方式。'))
        return
      }
      const unresolved = inspection.conflicts.filter(conflict => {
        const choice = conflictChoices[conflict.sourceId]
        return !(choice === 'overwrite' && conflict.canOverwrite)
      })
      if (unresolved.length > 0) {
        setError(t('检测到 {count} 项路径冲突，请逐项选择处理方式。', { count: unresolved.length }))
        return
      }
      const requestId = crypto.randomUUID()
      const result = await runTrackedOperation(
        requestId,
        () =>
          window.desktop.templateManagement.importTemplatesBatch({
            items: candidates.map(source => ({
              content: source.content,
              conflictAction: conflictChoices[source.id] === 'overwrite' ? 'overwrite' : 'create',
              expectedExistingFileState:
                conflictChoices[source.id] === 'overwrite'
                  ? (inspectedBySource.get(source.id)?.existingFileState ?? null)
                  : null,
              metadata: classifications[source.id]?.metadata ?? null,
              relativePath: targetPaths[source.id]!,
              sourceId: source.id,
            })),
            requestId,
          }),
        setTaskStatus,
      )
      onComplete(result)
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('批量导入未完成，请检查目标路径。'))
    } finally {
      setBusyMode(null)
    }
  }

  return (
    <Dialog.Root
      onOpenChange={nextOpen => {
        if (!nextOpen) requestClose()
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[60] bg-overlay/70 backdrop-blur-[4px]" />
        <Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-[61] flex h-[min(820px,calc(100vh-32px))] w-[min(1040px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-primary/18 bg-panel shadow-2xl outline-none ring-1 ring-white/8">
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileCode2 aria-hidden="true" className="size-4" />
            </span>
            <div>
              <Dialog.Title className="text-sm font-semibold">
                {t('批量导入 C++ 模板')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {t('默认全选，可直接导入或按需生成 AI 元数据；确认前不会写入当前工作区。')}
              </Dialog.Description>
            </div>
            <Button
              aria-label={t('关闭批量导入')}
              className="relative z-10 ml-auto"
              disabled={Boolean(stagingAction)}
              onClick={requestClose}
              size="close"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="pointer-events-none size-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {error && (
              <div
                className="mb-4 rounded-xl border border-red-500/25 bg-red-500/7 px-3 py-2.5 text-xs text-red-700 dark:text-red-300"
                role="alert"
              >
                {t(error)}
              </div>
            )}

            {taskStatus && ['queued', 'running', 'cancelling'].includes(taskStatus.state) && (
              <div className="mb-4">
                <TaskProgressIndicator status={taskStatus} title="批量任务" />
              </div>
            )}

            {importFlow === 'staging' && stagingLoading && (
              <div className="mb-4 rounded-xl border border-primary/20 bg-primary/6 px-3 py-2 text-xs text-muted-foreground">
                <LoaderCircle className="mr-2 inline-block size-3.5 animate-spin text-primary" />
                {t('正在读取可恢复的暂存批次…')}
              </div>
            )}

            {importFlow === 'staging' && !staging && stagingSessions.length > 0 && (
              <section
                aria-label={t('可恢复的暂存批次')}
                className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4"
              >
                <div className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <h2 className="text-xs font-semibold">{t('发现可恢复的暂存批次')}</h2>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {t('这些批次尚未写入当前工作区；恢复后可继续处理、修改路径或放弃。')}
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {stagingSessions.map(session => (
                    <div
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/60 p-3"
                      key={session.id}
                    >
                      <span className="min-w-0 flex-1 text-xs font-medium">
                        {t('已处理 {processed} / {total}', {
                          processed: session.processedCount,
                          total: session.totalCount,
                        })}
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          {t(sessionLabels[session.status])}
                        </span>
                      </span>
                      <Button
                        disabled={Boolean(busyMode) || Boolean(stagingAction)}
                        onClick={() => void resumeStaging(session)}
                        size="compact"
                        type="button"
                        variant="outline"
                      >
                        {t('恢复批次')}
                      </Button>
                      <Button
                        disabled={Boolean(busyMode) || Boolean(stagingAction)}
                        onClick={() => {
                          void discardStaging(false, session)
                        }}
                        size="compact"
                        type="button"
                        variant="ghost"
                      >
                        {t('放弃批次')}
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {importFlow === 'staging' && staging && (
              <section
                aria-label={t('暂存批次状态')}
                className="mb-4 rounded-2xl border border-border bg-background/55 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold">{t('暂存批次')}</span>
                  <Badge tone={staging.status === 'failed' ? 'warning' : 'accent'}>
                    {t(sessionLabels[staging.status])}
                  </Badge>
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                    {t('已处理 {processed} / {total}', {
                      processed: staging.processedCount,
                      total: staging.totalCount,
                    })}
                  </span>
                </div>
                {staging.currentItem && (
                  <p className="mt-2 truncate text-[11px] text-muted-foreground">
                    {t('当前项')}：{staging.currentItem}
                  </p>
                )}
                {staging.error && (
                  <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/6 px-2.5 py-2 text-[11px] text-red-700 dark:text-red-300">
                    {t(staging.error)}
                  </p>
                )}
                {staging.status === 'failed' && !busyMode && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      disabled={Boolean(stagingAction)}
                      onClick={() => void processStaging(true, true)}
                      size="compact"
                      type="button"
                      variant="outline"
                    >
                      {t('重试 AI 处理')}
                    </Button>
                    <Button
                      disabled={Boolean(stagingAction)}
                      onClick={() => void processStaging(false, true)}
                      size="compact"
                      type="button"
                      variant="outline"
                    >
                      {t('继续手动准备')}
                    </Button>
                  </div>
                )}
                {staging.status === 'ready' && !stagingAiDraft && !busyMode && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      disabled={
                        Boolean(stagingAction) ||
                        typeof stagingApi().previewBatchStagingAiPlan !== 'function'
                      }
                      onClick={() => void previewStagingAiPlan()}
                      size="compact"
                      type="button"
                      variant="outline"
                    >
                      <Sparkles className="size-3.5" />
                      {t('AI 整理暂存目录')}
                    </Button>
                    <span className="text-[10px] text-muted-foreground">
                      {t('只修改暂存分支，确认后才会进入当前工作区')}
                    </span>
                  </div>
                )}
              </section>
            )}

            {stagingAiDraft && (
              <section
                aria-label={t('暂存区 AI 整理计划')}
                className="mb-4 rounded-2xl border border-warning/25 bg-warning/5 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles className="size-4 text-warning" />
                  <h2 className="text-xs font-semibold">{t('暂存区 AI 整理计划')}</h2>
                  <Badge tone="warning">{stagingAiDraft.operations.length}</Badge>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {t('仅对勾选的移动或删除操作生效')}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  {stagingAiDraft.summary || t('请检查每项路径变化后再应用。')}
                </p>
                {stagingAiDraft.operations.length === 0 && (
                  <p className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-2 text-[11px] text-warning-foreground">
                    {t(
                      'AI 未返回可执行修改；请查看上方本地审计结果。若仍有不合理分类，请先修改暂存目标路径后再生成计划。',
                    )}
                  </p>
                )}
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {stagingAiDraft.operations.map(operation => {
                    const selectable = operation.kind !== 'update-metadata'
                    return (
                      <label
                        className="flex gap-2 rounded-lg border border-border bg-background/60 p-2 text-[10px]"
                        key={operation.id}
                      >
                        <input
                          checked={selectedStagingAiOperationIds.has(operation.id)}
                          className="mt-0.5 size-3.5 accent-warning"
                          disabled={!selectable || Boolean(stagingAction)}
                          onChange={event =>
                            setSelectedStagingAiOperationIds(current => {
                              const next = new Set(current)
                              if (event.target.checked) next.add(operation.id)
                              else next.delete(operation.id)
                              return next
                            })
                          }
                          type="checkbox"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">
                            {operation.kind === 'move'
                              ? t('移动')
                              : operation.kind === 'delete'
                                ? t('删除重复项')
                                : t('更新元数据（进入工作区后处理）')}
                          </span>
                          <span className="mt-1 block break-all font-mono">
                            {operation.sourcePath}
                            {operation.kind === 'move' && ` → ${operation.targetPath}`}
                          </span>
                          <span className="mt-1 block text-muted-foreground">
                            {operation.reason}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button
                    disabled={Boolean(stagingAction)}
                    onClick={() => {
                      setStagingAiDraft(null)
                      setSelectedStagingAiOperationIds(new Set())
                    }}
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    {t('暂不应用')}
                  </Button>
                  <Button
                    disabled={Boolean(stagingAction) || selectedStagingAiOperationIds.size === 0}
                    onClick={() => void applyStagingAiPlan()}
                    size="compact"
                    type="button"
                  >
                    {stagingAction === 'ai-plan' && (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    )}
                    {t('应用所选整理')}
                  </Button>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-background/55 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={Boolean(busyMode) || Boolean(staging) || Boolean(stagingAction)}
                  onClick={() => void chooseSources('files')}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  {busyMode === 'choose' ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  {t('选择多个 C++ 文件')}
                </Button>
                <Button
                  disabled={Boolean(busyMode) || Boolean(staging) || Boolean(stagingAction)}
                  onClick={() => void chooseSources('directory')}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  <FolderSearch className="size-3.5" />
                  {t('扫描 C++ 文件夹')}
                </Button>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {sources.length > 0
                    ? t('已选 {selected}/{total} 份 · {characters} 字符', {
                        characters: totalCharacters,
                        selected: selectedSources.length,
                        total: sources.length,
                      })
                    : t('单批最多 100 份，仅接受 .cpp')}
                </span>
              </div>
            </section>

            {sources.length === 0 ? (
              <div className="mt-4 grid min-h-72 place-items-center rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
                <div>
                  <FolderSearch className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">{t('选择待复制的 C++ 源码')}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t('原文件只读；最终会在当前模板工作区创建新的 .cpp 文件。')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Button
                    disabled={
                      Boolean(busyMode) ||
                      Boolean(stagingAction) ||
                      selectedSources.length === sources.length
                    }
                    onClick={() => {
                      setSelectedSourceIds(new Set(sources.map(source => source.id)))
                      setConflicts([])
                      setError(null)
                      if (importFlow === 'staging' && staging) {
                        void persistAllStagingSelections('include')
                      }
                    }}
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    {t('全选')}
                  </Button>
                  <Button
                    disabled={
                      Boolean(busyMode) || Boolean(stagingAction) || selectedSources.length === 0
                    }
                    onClick={() => {
                      setSelectedSourceIds(new Set())
                      setConflicts([])
                      setError(null)
                      if (importFlow === 'staging' && staging) {
                        void persistAllStagingSelections('skip')
                      }
                    }}
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    {t('取消全选')}
                  </Button>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {t('默认全选；取消勾选的源码不会发送给 AI，也不会加入工作区。')}
                  </span>
                </div>
                {sources.map(source => {
                  const classification = classifications[source.id]
                  const stagingItem = staging?.items.find(item => item.sourceId === source.id)
                  const conflict = conflicts.find(item => item.sourceId === source.id)
                  const selected = selectedSourceIds.has(source.id)
                  const itemBusy = Boolean(busyMode) || Boolean(stagingAction)
                  const itemIndex = selectedSources.findIndex(item => item.id === source.id)
                  const liveProcessedCount =
                    taskStatus?.progress.processedCount ?? progress.completed
                  const liveTotalCount =
                    taskStatus?.progress.totalCount ?? progress.total ?? selectedSources.length
                  const isLiveCurrent =
                    busyMode === 'classify' &&
                    (taskStatus?.progress.currentItem === source.displayPath ||
                      (!taskStatus?.progress.currentItem && itemIndex === liveProcessedCount))
                  const isLiveProcessed =
                    busyMode === 'classify' && itemIndex >= 0 && itemIndex < liveProcessedCount
                  return (
                    <article
                      className={`rounded-xl border p-3 transition-colors ${
                        selected
                          ? 'border-border bg-background/60'
                          : 'border-border/60 bg-muted/25 opacity-65'
                      }`}
                      key={source.id}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`${t('选择导入')} ${source.displayPath}`}
                          checked={selected}
                          className="size-4 rounded border-border accent-primary"
                          disabled={itemBusy}
                          onChange={event => {
                            const nextSelected = event.target.checked
                            setSelectedSourceIds(current => {
                              const next = new Set(current)
                              if (nextSelected) next.add(source.id)
                              else next.delete(source.id)
                              return next
                            })
                            setConflicts([])
                            setError(null)
                            if (importFlow === 'staging' && staging) {
                              void persistStagingItem(
                                source.id,
                                nextSelected ? 'include' : 'skip',
                                nextSelected
                                  ? (targetPaths[source.id] ?? source.displayPath)
                                  : null,
                              )
                            }
                          }}
                          type="checkbox"
                        />
                        {classification ? (
                          <CheckCircle2 className="size-4 shrink-0 text-success" />
                        ) : busyMode === 'classify' &&
                          progress.completed ===
                            selectedSources.findIndex(item => item.id === source.id) ? (
                          <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" />
                        ) : (
                          <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                          {source.displayPath}
                        </span>
                        <Badge>{formatTemplateSourceEncoding(source.sourceEncoding)}</Badge>
                        {stagingItem && (
                          <Badge
                            tone={
                              stagingItem.status === 'failed'
                                ? 'warning'
                                : stagingItem.status === 'completed' && classification
                                  ? 'success'
                                  : 'neutral'
                            }
                          >
                            {t(
                              stagingItem.status === 'completed' && !classification
                                ? '暂存项：已准备（未分类）'
                                : itemLabels[stagingItem.status],
                            )}
                          </Badge>
                        )}
                        {classification && (
                          <Badge tone="accent">
                            {Math.round(classification.confidence * 100)}%
                          </Badge>
                        )}
                      </div>
                      {busyMode === 'classify' && selected && liveTotalCount > 0 && (
                        <p
                          className="mt-1 pl-6 text-[10px] tabular-nums text-muted-foreground"
                          data-testid={`batch-item-progress-${source.id}`}
                        >
                          {isLiveCurrent
                            ? t('处理中 {current}/{total}', {
                                current: Math.min(itemIndex + 1, liveTotalCount),
                                total: liveTotalCount,
                              })
                            : isLiveProcessed
                              ? t('已处理 {current}/{total}', {
                                  current: itemIndex + 1,
                                  total: liveTotalCount,
                                })
                              : t('等待处理 {current}/{total}', {
                                  current: Math.max(itemIndex + 1, liveProcessedCount + 1),
                                  total: liveTotalCount,
                                })}
                        </p>
                      )}
                      {selected && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <p className="text-[10px] text-muted-foreground sm:col-span-2">
                            {t('已按源编码读取；工作区新副本统一保存为 UTF-8。')}
                          </p>
                          <label className="text-[10px] font-medium text-muted-foreground">
                            {t('工作区保存路径')}
                            <input
                              aria-label={`${t('工作区保存路径')} ${source.displayPath}`}
                              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                              disabled={itemBusy}
                              onChange={event => {
                                setTargetPaths(current => ({
                                  ...current,
                                  [source.id]: event.target.value,
                                }))
                                if (conflict) {
                                  setConflictChoices(current => ({
                                    ...current,
                                    [source.id]: 'rename',
                                  }))
                                }
                                setConflicts([])
                                setError(null)
                              }}
                              onBlur={() => {
                                if (importFlow === 'staging' && staging) {
                                  void persistStagingItem(
                                    source.id,
                                    'include',
                                    targetPaths[source.id] ?? source.displayPath,
                                  )
                                }
                              }}
                              value={targetPaths[source.id] ?? ''}
                            />
                          </label>
                          {classification ? (
                            <>
                              <div className="self-end text-right text-[10px] text-muted-foreground">
                                <p>{classification.categoryPath.join(' / ')}</p>
                                <p className="mt-1">
                                  {classification.providerName} · {classification.model}
                                </p>
                              </div>
                              <p className="text-[10px] leading-4 text-muted-foreground sm:col-span-2">
                                {classification.metadata.tags.join('、') || t('无标签')} ·{' '}
                                {classification.classificationReason}
                              </p>
                            </>
                          ) : (
                            <p className="self-end text-right text-[10px] text-muted-foreground">
                              {t('未生成 AI 元数据，将按空元数据导入')}
                            </p>
                          )}
                          {conflict && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 sm:col-span-2">
                              <div className="flex gap-2 text-xs text-amber-800 dark:text-amber-200">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                <div>
                                  <p className="font-semibold">{t('目标路径冲突')}</p>
                                  <p className="mt-1 text-[11px] leading-4">
                                    {t(conflictMessages[conflict.kind])}
                                  </p>
                                  {conflict.actualRelativePath &&
                                    conflict.actualRelativePath !== conflict.relativePath && (
                                      <p className="mt-1 font-mono text-[10px]">
                                        {t('已有路径')}：{conflict.actualRelativePath}
                                      </p>
                                    )}
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  aria-pressed={conflictChoices[source.id] === 'skip'}
                                  onClick={() =>
                                    setConflictChoices(current => ({
                                      ...current,
                                      [source.id]: 'skip',
                                    }))
                                  }
                                  size="compact"
                                  type="button"
                                  variant="outline"
                                >
                                  {t('不加入')}
                                </Button>
                                <Button
                                  aria-pressed={conflictChoices[source.id] === 'rename'}
                                  onClick={() =>
                                    setConflictChoices(current => ({
                                      ...current,
                                      [source.id]: 'rename',
                                    }))
                                  }
                                  size="compact"
                                  type="button"
                                  variant="outline"
                                >
                                  {t('修改文件名')}
                                </Button>
                                {conflict.canOverwrite && (
                                  <Button
                                    aria-pressed={conflictChoices[source.id] === 'overwrite'}
                                    onClick={() =>
                                      setConflictChoices(current => ({
                                        ...current,
                                        [source.id]: 'overwrite',
                                      }))
                                    }
                                    size="compact"
                                    type="button"
                                    variant="outline"
                                  >
                                    {t('覆盖已有文件')}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                          {stagingItem?.error && (
                            <p className="rounded-lg border border-red-500/20 bg-red-500/6 px-2.5 py-2 text-[11px] text-red-700 dark:text-red-300 sm:col-span-2">
                              {t(stagingItem.error)}
                            </p>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border px-5 py-4">
            <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
              {t('补全语言')}
              <select
                aria-label={t('批量补全语言')}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                disabled={Boolean(busyMode) || Boolean(staging) || Boolean(stagingAction)}
                onChange={event => {
                  setOutputLanguage(event.target.value as TemplateMetadataLanguage)
                  setClassifications({})
                  setConflictChoices({})
                  setConflicts([])
                  setTargetPaths(
                    Object.fromEntries(sources.map(source => [source.id, source.displayPath])),
                  )
                }}
                value={outputLanguage}
              >
                <option value="zh-CN">{t('中文')}</option>
                <option value="en">English</option>
              </select>
            </label>
            {busyMode === 'classify' && (
              <span className="text-xs text-muted-foreground">
                {t('正在补全 {completed}/{total}', progress)}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {busyMode === 'classify' || (importFlow === 'staging' && busyMode === 'import') ? (
                <Button
                  onClick={() => {
                    cancelRequested.current = true
                    const requestId =
                      importFlow === 'staging'
                        ? activeStagingRequestId.current
                        : activeClassificationRequestId.current
                    if (
                      requestId &&
                      typeof window.desktop.templateManagement.cancelClassification === 'function'
                    ) {
                      void window.desktop.templateManagement.cancelClassification(requestId)
                    }
                  }}
                  type="button"
                  variant="outline"
                >
                  {importFlow === 'staging' ? t('停止处理并保留暂存') : t('取消当前及后续补全')}
                </Button>
              ) : (
                <Button
                  disabled={Boolean(busyMode) || Boolean(stagingAction)}
                  onClick={() => {
                    if (importFlow === 'staging' && staging) {
                      void discardStaging()
                    } else {
                      onOpenChange(false)
                    }
                  }}
                  type="button"
                  variant="outline"
                >
                  {importFlow === 'staging' && staging ? t('放弃暂存') : t('取消')}
                </Button>
              )}
              <Button
                disabled={
                  Boolean(busyMode) ||
                  Boolean(stagingAction) ||
                  selectedSources.length === 0 ||
                  (importFlow === 'staging' &&
                    (!staging || staging.status === 'ready' || staging.status === 'applying'))
                }
                onClick={() => void previewClassification()}
                type="button"
                variant="outline"
              >
                {busyMode === 'preview' ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {completedCount > 0 ? t('重新生成所选元数据') : t('AI 补全所选模板')}
              </Button>
              <Button
                disabled={
                  Boolean(busyMode) ||
                  Boolean(stagingAction) ||
                  (importFlow === 'staging'
                    ? !staging ||
                      (staging.status === 'ready' && !stagingReadyToApply) ||
                      staging.status === 'applying'
                    : !readyToImport)
                }
                onClick={() => void importAll()}
                type="button"
              >
                {busyMode === 'import' && <LoaderCircle className="size-4 animate-spin" />}
                {importFlow === 'staging'
                  ? staging?.status === 'ready'
                    ? t('确认应用 {count} 份', { count: stagingIncludedItems.length })
                    : staging?.status === 'failed'
                      ? t('重试并准备暂存')
                      : t('准备暂存 {count} 份', {
                          count: stagingIncludedItems.length || selectedSources.length,
                        })
                  : t('确认导入 {count} 份', { count: importSources.length })}
              </Button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>

      {preview && (
        <AiRequestPreviewDialog
          busy={false}
          onCancel={() => setPreview(null)}
          onConfirm={() =>
            void (importFlow === 'staging'
              ? processStaging(true, staging?.status === 'failed')
              : classifyAll())
          }
          preview={preview}
        />
      )}
      {stagingAiPreview && (
        <AiRequestPreviewDialog
          busy={busyMode === 'ai-plan'}
          onCancel={() => {
            if (stagingAiRequestId && busyMode === 'ai-plan') {
              void stagingApi().cancelBatchStagingAiPlan?.(stagingAiRequestId)
            }
            setStagingAiPreview(null)
            setStagingAiRequestId(null)
          }}
          onConfirm={() => void generateStagingAiPlan()}
          preview={stagingAiPreview}
          taskStatus={taskStatus}
        />
      )}
    </Dialog.Root>
  )
}

import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertCircle,
  Check,
  FileImage,
  ImagePlus,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'

import type {
  ProblemAnalysisCandidate,
  ProblemAnalysisImage,
} from '@core/contracts/problem-analysis'
import {
  emptyProblemAnalysisStructure,
  type CreateProblemRequest,
  type Problem,
  type RelationType,
} from '@core/contracts/problem'
import type { AiOutputLanguage, AiRequestPreview } from '@core/contracts/ai-request'
import type { TemplateSummary } from '@core/contracts/workspace'

import { AiRequestPreviewDialog } from '@/components/ai-request-preview-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

import { problemStatusLabels, relationTypeLabels } from './problem-labels'

interface ProblemAnalysisDialogProps {
  onCreated: (problem: Problem) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  templates: TemplateSummary[]
}

interface RelationDraft extends ProblemAnalysisCandidate {
  note: string
  source: 'ai' | 'manual'
}

const roleLabels: Record<ProblemAnalysisCandidate['role'], string> = {
  'alternative-solution': '替代解法',
  'direct-solution': '直接解法',
  optimization: '优化方向',
  prerequisite: '前置能力',
  subproblem: '子问题',
}

function emptyFields(): CreateProblemRequest {
  return {
    aiSummary: '',
    analysis: { ...emptyProblemAnalysisStructure },
    difficulty: null,
    notes: '',
    platform: null,
    problemCode: null,
    statement: '',
    status: 'unattempted',
    tags: [],
    title: '',
    url: null,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。'
}

function nullable(value: string): string | null {
  return value.trim() || null
}

function readClipboardImage(file: File): Promise<ProblemAnalysisImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return Promise.reject(new Error('仅支持 PNG、JPEG 或 WebP 图片。'))
  }
  if (file.size > 8 * 1024 * 1024) {
    return Promise.reject(new Error('单张题目图片不能超过 8 MiB。'))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取粘贴的图片。'))
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve({ dataUrl: reader.result, name: file.name || '粘贴图片' })
        : reject(new Error('无法读取粘贴的图片。'))
    reader.readAsDataURL(file)
  })
}

function mergeAiFields(
  current: CreateProblemRequest,
  generated: CreateProblemRequest,
): CreateProblemRequest {
  return {
    aiSummary: current.aiSummary.trim() || generated.aiSummary,
    analysis: {
      algorithmSignals:
        current.analysis.algorithmSignals.length > 0
          ? current.analysis.algorithmSignals
          : generated.analysis.algorithmSignals,
      constraints:
        current.analysis.constraints.length > 0
          ? current.analysis.constraints
          : generated.analysis.constraints,
      edgeCases:
        current.analysis.edgeCases.length > 0
          ? current.analysis.edgeCases
          : generated.analysis.edgeCases,
      examples:
        current.analysis.examples.length > 0
          ? current.analysis.examples
          : generated.analysis.examples,
      inputDescription:
        current.analysis.inputDescription.trim() || generated.analysis.inputDescription,
      outputDescription:
        current.analysis.outputDescription.trim() || generated.analysis.outputDescription,
    },
    difficulty: current.difficulty ?? generated.difficulty,
    notes: current.notes.trim() || generated.notes,
    platform: current.platform ?? generated.platform,
    problemCode: current.problemCode ?? generated.problemCode,
    statement: current.statement,
    status: current.status,
    tags: [...new Set([...current.tags, ...generated.tags])],
    title: current.title.trim() || generated.title,
    url: current.url ?? generated.url,
  }
}

export function ProblemAnalysisDialog({
  onCreated,
  onOpenChange,
  open,
  templates,
}: ProblemAnalysisDialogProps) {
  const { locale, t } = useI18n()
  const localeRef = useRef(locale)
  localeRef.current = locale
  const [draftInfo, setDraftInfo] = useState<{ model: string; providerName: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<CreateProblemRequest>(emptyFields)
  const [images, setImages] = useState<ProblemAnalysisImage[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [outputLanguage, setOutputLanguage] = useState<AiOutputLanguage>('zh-CN')
  const [relationDrafts, setRelationDrafts] = useState<RelationDraft[]>([])
  const [requestPreview, setRequestPreview] = useState<AiRequestPreview | null>(null)
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [selectedManualTemplateId, setSelectedManualTemplateId] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [templateQuery, setTemplateQuery] = useState('')
  const activeRequestId = useRef<string | null>(null)
  const relationDraftsRef = useRef<RelationDraft[]>([])
  const selectedCandidatesRef = useRef<Set<string>>(new Set())
  relationDraftsRef.current = relationDrafts
  selectedCandidatesRef.current = selectedCandidates

  useEffect(() => {
    if (!open) return
    setDraftInfo(null)
    setError(null)
    setFields(emptyFields())
    setImages([])
    setIsBusy(false)
    setOutputLanguage(localeRef.current)
    setRelationDrafts([])
    setRequestPreview(null)
    setSelectedCandidates(new Set())
    setSelectedManualTemplateId('')
    setTagsText('')
    setTemplateQuery('')
  }, [open])

  const availableManualTemplates = useMemo(() => {
    const selected = new Set(relationDrafts.map(candidate => candidate.templateId))
    const query = templateQuery.trim().toLocaleLowerCase('zh-CN')
    return templates
      .filter(template => !selected.has(template.id))
      .filter(
        template =>
          !query ||
          `${template.name} ${template.relativePath} ${template.language}`
            .toLocaleLowerCase('zh-CN')
            .includes(query),
      )
      .slice(0, 50)
  }, [relationDrafts, templateQuery, templates])

  const chooseImages = async () => {
    setError(null)
    try {
      const chosen = await window.desktop.problemAnalysis.chooseImages()
      if (images.length + chosen.length > 6) {
        setError(t('单次题目分析最多添加 6 张图片。'))
        return
      }
      setImages(current => [...current, ...chosen])
    } catch (caught) {
      setError(t(errorMessage(caught)))
    }
  }

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()
    if (images.length + files.length > 6) {
      setError(t('单次题目分析最多添加 6 张图片。'))
      return
    }
    try {
      const pasted = await Promise.all(files.map(readClipboardImage))
      setImages(current => [...current, ...pasted])
      setError(null)
    } catch (caught) {
      setError(t(errorMessage(caught)))
    }
  }

  const executeAnalysis = async () => {
    const requestId = crypto.randomUUID()
    activeRequestId.current = requestId
    setError(null)
    setIsBusy(true)
    try {
      const result = await window.desktop.problemAnalysis.analyze({
        images,
        outputLanguage,
        requestId,
        text: fields.statement,
      })
      if (activeRequestId.current !== requestId) return
      setRequestPreview(null)
      setDraftInfo({ model: result.model, providerName: result.providerName })
      setFields(current => mergeAiFields(current, result.fields))
      setTagsText(current => {
        const existing = current
          .split(/[,，]/)
          .map(tag => tag.trim())
          .filter(Boolean)
        return [...new Set([...existing, ...result.fields.tags])].join(', ')
      })
      const generatedDrafts: RelationDraft[] = result.candidates.map(candidate => ({
        ...candidate,
        note: candidate.reason,
        source: 'ai',
      }))
      const manual = relationDraftsRef.current.filter(candidate => candidate.source === 'manual')
      const manualIds = new Set(manual.map(candidate => candidate.templateId))
      const nextDrafts = [
        ...manual,
        ...generatedDrafts.filter(candidate => !manualIds.has(candidate.templateId)),
      ].slice(0, 8)
      const nextSelected = new Set(
        manual
          .filter(candidate => selectedCandidatesRef.current.has(candidate.templateId))
          .map(candidate => candidate.templateId),
      )
      for (const candidate of generatedDrafts) {
        if (candidate.confidence >= 0.65) nextSelected.add(candidate.templateId)
      }
      setRelationDrafts(nextDrafts)
      setSelectedCandidates(nextSelected)
    } catch (caught) {
      if (activeRequestId.current !== requestId) return
      setRequestPreview(null)
      setError(t(errorMessage(caught)))
    } finally {
      if (activeRequestId.current === requestId) {
        activeRequestId.current = null
        setIsBusy(false)
      }
    }
  }

  const cancelAnalysis = () => {
    const requestId = activeRequestId.current
    if (!requestId) return
    activeRequestId.current = null
    setRequestPreview(null)
    setIsBusy(false)
    setError(t('AI 请求已取消，已填写的题目内容和模板选择均已保留。'))
    void window.desktop.problemAnalysis.cancel(requestId)
  }

  const previewAnalysis = async () => {
    setError(null)
    setIsBusy(true)
    try {
      setRequestPreview(
        await window.desktop.problemAnalysis.preview({
          images,
          outputLanguage,
          text: fields.statement,
        }),
      )
    } catch (caught) {
      setError(t(errorMessage(caught)))
    } finally {
      setIsBusy(false)
    }
  }

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setIsBusy(true)
    try {
      const tags = [
        ...new Set(
          tagsText
            .split(/[,，]/)
            .map(tag => tag.trim())
            .filter(Boolean),
        ),
      ]
      const problem = await window.desktop.problemAnalysis.commit({
        fields: { ...fields, tags },
        images,
        relations: relationDrafts
          .filter(candidate => selectedCandidates.has(candidate.templateId))
          .map(candidate => ({
            note: candidate.note,
            relationType: candidate.relationType,
            templateId: candidate.templateId,
          })),
      })
      onCreated(problem)
      onOpenChange(false)
    } catch (caught) {
      setError(t(errorMessage(caught)))
    } finally {
      setIsBusy(false)
    }
  }

  const addManualTemplate = () => {
    const template = templates.find(item => item.id === selectedManualTemplateId)
    if (!template || relationDrafts.length >= 8) return
    const candidate: RelationDraft = {
      applicableWhen: [],
      confidence: 1,
      evidence: [],
      matchedCapabilities: [],
      notApplicableWhen: [],
      note: '',
      reason: t('用户手动选择。'),
      relationType: 'used',
      role: 'direct-solution',
      source: 'manual',
      templateId: template.id,
      templateName: template.name,
      templatePath: template.relativePath,
      warnings: [],
    }
    setRelationDrafts(current => [...current, candidate])
    setSelectedCandidates(current => new Set(current).add(template.id))
    setSelectedManualTemplateId('')
  }

  const updateRelation = (templateId: string, patch: Partial<RelationDraft>) => {
    setRelationDrafts(current =>
      current.map(candidate =>
        candidate.templateId === templateId ? { ...candidate, ...patch } : candidate,
      ),
    )
  }

  const removeRelation = (templateId: string) => {
    setRelationDrafts(current => current.filter(candidate => candidate.templateId !== templateId))
    setSelectedCandidates(current => {
      const next = new Set(current)
      next.delete(templateId)
      return next
    })
  }

  const inputClass =
    'mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring'

  return (
    <Dialog.Root onOpenChange={value => !isBusy && onOpenChange(value)} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-overlay/60 backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby="problem-create-description"
          className="dialog-surface fixed left-1/2 top-1/2 z-50 flex h-[min(870px,calc(100vh-24px))] w-[min(1120px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-primary/18 bg-panel shadow-2xl outline-none ring-1 ring-white/8"
          onInteractOutside={event => isBusy && event.preventDefault()}
        >
          <header className="flex items-start border-b border-border px-5 py-4">
            <span className="mr-3 grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles aria-hidden="true" className="size-4" />
            </span>
            <div>
              <Dialog.Title className="text-sm font-semibold">{t('新建题目')}</Dialog.Title>
              <Dialog.Description
                className="mt-1 text-xs text-muted-foreground"
                id="problem-create-description"
              >
                {draftInfo
                  ? t('AI 已补全草稿：{provider} · {model}。你仍可修改后一次保存。', {
                      model: draftInfo.model,
                      provider: draftInfo.providerName,
                    })
                  : t('手动填写，或在同一窗口中加入图文并请求 AI 补全。')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                aria-label={t('关闭新建题目')}
                className="ml-auto"
                disabled={isBusy}
                size="close"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </Dialog.Close>
          </header>

          {error && (
            <div
              className="flex items-start gap-2 border-b border-red-500/20 bg-red-500/7 px-5 py-2.5 text-xs text-red-700 dark:text-red-300"
              role="alert"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
              <button
                aria-label={t('关闭分析错误')}
                className="ml-auto rounded p-0.5 hover:bg-red-500/10"
                onClick={() => setError(null)}
                type="button"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          )}

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => void confirm(event)}>
            <div className="grid min-h-0 flex-1 gap-4 p-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
              <section className="min-h-0 overflow-y-auto rounded-2xl border border-border bg-background/55 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold sm:col-span-2">
                    {t('题目标题')}
                    <input
                      autoFocus
                      className={inputClass}
                      maxLength={200}
                      onChange={event =>
                        setFields(current => ({ ...current, title: event.target.value }))
                      }
                      placeholder={t('例如 最短路计数')}
                      required
                      value={fields.title}
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    {t('平台')}
                    <input
                      className={inputClass}
                      maxLength={80}
                      onChange={event =>
                        setFields(current => ({
                          ...current,
                          platform: nullable(event.target.value),
                        }))
                      }
                      value={fields.platform ?? ''}
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    {t('题号')}
                    <input
                      className={inputClass}
                      maxLength={80}
                      onChange={event =>
                        setFields(current => ({
                          ...current,
                          problemCode: nullable(event.target.value),
                        }))
                      }
                      value={fields.problemCode ?? ''}
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    {t('难度')}
                    <input
                      className={inputClass}
                      maxLength={40}
                      onChange={event =>
                        setFields(current => ({
                          ...current,
                          difficulty: nullable(event.target.value),
                        }))
                      }
                      value={fields.difficulty ?? ''}
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    {t('状态')}
                    <select
                      className={inputClass}
                      onChange={event =>
                        setFields(current => ({
                          ...current,
                          status: event.target.value as CreateProblemRequest['status'],
                        }))
                      }
                      value={fields.status}
                    >
                      {Object.entries(problemStatusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold sm:col-span-2">
                    {t('题目链接')}
                    <input
                      className={inputClass}
                      maxLength={2048}
                      onChange={event =>
                        setFields(current => ({ ...current, url: nullable(event.target.value) }))
                      }
                      type="url"
                      value={fields.url ?? ''}
                    />
                  </label>
                  <label className="text-xs font-semibold sm:col-span-2">
                    {t('标签')}
                    <input
                      className={inputClass}
                      onChange={event => setTagsText(event.target.value)}
                      placeholder={t('最短路, 图论, Dijkstra')}
                      value={tagsText}
                    />
                  </label>
                  <label className="text-xs font-semibold sm:col-span-2">
                    {t('原始题面')}
                    <textarea
                      aria-label={t('原始题面')}
                      className="mt-1.5 min-h-36 w-full resize-y rounded-xl border border-border bg-panel px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
                      maxLength={100_000}
                      onChange={event =>
                        setFields(current => ({ ...current, statement: event.target.value }))
                      }
                      onPaste={event => void handlePaste(event)}
                      placeholder={t('记录原始题面、输入输出和数据范围…')}
                      value={fields.statement}
                    />
                  </label>
                  <label className="text-xs font-semibold sm:col-span-2">
                    {t('AI 题目摘要')}
                    <textarea
                      className="mt-1.5 min-h-20 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
                      onChange={event =>
                        setFields(current => ({ ...current, aiSummary: event.target.value }))
                      }
                      value={fields.aiSummary}
                    />
                  </label>
                  <label className="text-xs font-semibold sm:col-span-2">
                    {t('本地备注')}
                    <textarea
                      className="mt-1.5 min-h-20 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
                      onChange={event =>
                        setFields(current => ({ ...current, notes: event.target.value }))
                      }
                      value={fields.notes}
                    />
                  </label>
                </div>

                {draftInfo && (
                  <section className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-3">
                    <h3 className="text-xs font-semibold">{t('结构化分析')}</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ['inputDescription', '输入说明'],
                          ['outputDescription', '输出说明'],
                        ] as const
                      ).map(([key, label]) => (
                        <label className="text-[11px] font-medium" key={key}>
                          {t(label)}
                          <textarea
                            className="mt-1 min-h-20 w-full resize-y rounded-lg border border-border bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                            onChange={event =>
                              setFields(current => ({
                                ...current,
                                analysis: { ...current.analysis, [key]: event.target.value },
                              }))
                            }
                            value={fields.analysis[key]}
                          />
                        </label>
                      ))}
                      {(
                        [
                          ['constraints', '数据约束'],
                          ['algorithmSignals', '算法信号'],
                          ['edgeCases', '边界情况'],
                        ] as const
                      ).map(([key, label]) => (
                        <label className="text-[11px] font-medium sm:col-span-2" key={key}>
                          {t(label)}
                          <textarea
                            className="mt-1 min-h-20 w-full resize-y rounded-lg border border-border bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                            onChange={event =>
                              setFields(current => ({
                                ...current,
                                analysis: {
                                  ...current.analysis,
                                  [key]: event.target.value
                                    .split('\n')
                                    .map(item => item.trim())
                                    .filter(Boolean),
                                },
                              }))
                            }
                            value={fields.analysis[key].join('\n')}
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                )}
              </section>

              <section className="min-h-0 space-y-4 overflow-y-auto rounded-2xl border border-border bg-surface-subtle/45 p-4">
                <div className="rounded-xl border border-primary/18 bg-primary/5 p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles aria-hidden="true" className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold">{t('AI 图文补全')}</h3>
                    <label className="ml-auto flex items-center gap-2 text-[10px] font-medium">
                      {t('输出语言')}
                      <select
                        aria-label={t('题目分析输出语言')}
                        className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                        disabled={isBusy}
                        onChange={event =>
                          setOutputLanguage(event.target.value as AiOutputLanguage)
                        }
                        value={outputLanguage}
                      >
                        <option value="zh-CN">{t('简体中文')}</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    {t('使用上方题面与下方图片补全空白字段；失败或取消不会清空你的内容。')}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      disabled={isBusy || images.length >= 6}
                      onClick={() => void chooseImages()}
                      size="compact"
                      type="button"
                      variant="outline"
                    >
                      <ImagePlus aria-hidden="true" className="size-3.5" />
                      {t('选择截图')}
                    </Button>
                    {activeRequestId.current ? (
                      <Button
                        onClick={cancelAnalysis}
                        size="compact"
                        type="button"
                        variant="outline"
                      >
                        {t('取消分析')}
                      </Button>
                    ) : (
                      <Button
                        disabled={isBusy || (!fields.statement.trim() && images.length === 0)}
                        onClick={() => void previewAnalysis()}
                        size="compact"
                        type="button"
                      >
                        {isBusy ? (
                          <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                        ) : (
                          <Sparkles aria-hidden="true" className="size-3.5" />
                        )}
                        {t(draftInfo ? '重新分析并补全' : 'AI 分析并补全')}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <div className="flex items-center gap-2">
                    <FileImage aria-hidden="true" className="size-4 text-muted-foreground" />
                    <h3 className="text-xs font-semibold">{t('题目图片')}</h3>
                    <Badge className="ml-auto">{images.length} / 6</Badge>
                  </div>
                  {images.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
                      {t('图片只在最终确认创建后保存。')}
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {images.map((image, index) => (
                        <article
                          className="flex items-center gap-2 rounded-lg border border-border bg-panel p-2"
                          key={`${image.name}-${index}`}
                        >
                          <img
                            alt={image.name}
                            className="size-10 rounded border border-border object-cover"
                            src={image.dataUrl}
                          />
                          <span className="min-w-0 flex-1 truncate text-[10px]">{image.name}</span>
                          <Button
                            aria-label={`${t('移除分析图片')} ${image.name}`}
                            onClick={() =>
                              setImages(current =>
                                current.filter((_, itemIndex) => itemIndex !== index),
                              )
                            }
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 aria-hidden="true" className="size-3.5" />
                          </Button>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <div className="flex items-center gap-2">
                    <Link2 aria-hidden="true" className="size-4 text-success" />
                    <div>
                      <h3 className="text-xs font-semibold">{t('模板关联草稿')}</h3>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {t('可手动搜索多份模板；AI 建议不会自动保存。')}
                      </p>
                    </div>
                    <Badge className="ml-auto">{selectedCandidates.size} / 8</Badge>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <label className="relative min-w-0 flex-1">
                      <Search
                        aria-hidden="true"
                        className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground"
                      />
                      <input
                        aria-label={t('搜索本地模板')}
                        className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                        onChange={event => setTemplateQuery(event.target.value)}
                        placeholder={t('名称、路径或语言')}
                        value={templateQuery}
                      />
                    </label>
                    <select
                      aria-label={t('选择本地模板')}
                      className="h-9 min-w-40 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                      disabled={relationDrafts.length >= 8 || availableManualTemplates.length === 0}
                      onChange={event => setSelectedManualTemplateId(event.target.value)}
                      value={selectedManualTemplateId}
                    >
                      <option value="">{t('选择模板…')}</option>
                      {availableManualTemplates.map(template => (
                        <option key={template.id} value={template.id}>
                          {template.name} · {template.relativePath}
                        </option>
                      ))}
                    </select>
                    <Button
                      aria-label={t('添加本地模板关联')}
                      disabled={!selectedManualTemplateId || relationDrafts.length >= 8}
                      onClick={addManualTemplate}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <Plus aria-hidden="true" className="size-3.5" />
                    </Button>
                  </div>

                  {relationDrafts.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
                      {t('尚未选择模板；没有可靠候选时可以保持为空。')}
                    </p>
                  ) : (
                    <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                      {relationDrafts.map(candidate => (
                        <article
                          className="rounded-xl border border-border bg-panel p-3"
                          key={candidate.templateId}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              aria-label={`${t('选择候选模板')} ${candidate.templateName}`}
                              checked={selectedCandidates.has(candidate.templateId)}
                              className="size-4 accent-primary"
                              onChange={event =>
                                setSelectedCandidates(current => {
                                  const next = new Set(current)
                                  if (event.target.checked) next.add(candidate.templateId)
                                  else next.delete(candidate.templateId)
                                  return next
                                })
                              }
                              type="checkbox"
                            />
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                              {candidate.templateName}
                            </span>
                            <Badge tone={candidate.source === 'ai' ? 'accent' : 'neutral'}>
                              {t(candidate.source === 'ai' ? 'AI 建议' : '手动选择')}
                            </Badge>
                            <Badge>{t(roleLabels[candidate.role])}</Badge>
                            {candidate.source === 'ai' && (
                              <span className="text-[10px] text-muted-foreground">
                                {Math.round(candidate.confidence * 100)}%
                              </span>
                            )}
                            <Button
                              aria-label={`${t('移除模板关联草稿')} ${candidate.templateName}`}
                              onClick={() => removeRelation(candidate.templateId)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <X aria-hidden="true" className="size-3.5" />
                            </Button>
                          </div>
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">
                            {candidate.templatePath}
                          </p>
                          {candidate.source === 'ai' && (
                            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                              {candidate.reason}
                              {candidate.evidence.length > 0 &&
                                ` · ${candidate.evidence.join('、')}`}
                            </p>
                          )}
                          <div className="mt-2 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
                            <select
                              aria-label={`${candidate.templateName} ${t('关系类型')}`}
                              className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                              disabled={!selectedCandidates.has(candidate.templateId)}
                              onChange={event =>
                                updateRelation(candidate.templateId, {
                                  relationType: event.target.value as RelationType,
                                })
                              }
                              value={candidate.relationType}
                            >
                              {Object.entries(relationTypeLabels).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {t(label)}
                                </option>
                              ))}
                            </select>
                            <input
                              aria-label={`${candidate.templateName} ${t('关联备注')}`}
                              className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                              disabled={!selectedCandidates.has(candidate.templateId)}
                              maxLength={500}
                              onChange={event =>
                                updateRelation(candidate.templateId, { note: event.target.value })
                              }
                              placeholder={t('为什么需要这份模板…')}
                              value={candidate.note}
                            />
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-border px-5 py-4">
              <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Check aria-hidden="true" className="size-3.5 text-success" />
                {t('最终确认后才会原子保存题目、图片和已勾选关系。')}
              </p>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button disabled={isBusy} type="button" variant="outline">
                    {t('取消')}
                  </Button>
                </Dialog.Close>
                <Button disabled={isBusy || !fields.title.trim()} type="submit">
                  {isBusy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                  {t('创建题目')}
                </Button>
              </div>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
      {requestPreview && (
        <AiRequestPreviewDialog
          allowCancelWhileBusy
          busy={isBusy}
          onCancel={() => {
            if (activeRequestId.current) cancelAnalysis()
            else setRequestPreview(null)
          }}
          onConfirm={() => void executeAnalysis()}
          preview={requestPreview}
        />
      )}
    </Dialog.Root>
  )
}

import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertCircle,
  Check,
  FileImage,
  ImagePlus,
  LoaderCircle,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react'

import type {
  ProblemAnalysisCandidate,
  ProblemAnalysisDraft,
  ProblemAnalysisImage,
} from '@core/contracts/problem-analysis'
import type { CreateProblemRequest, Problem, RelationType } from '@core/contracts/problem'
import type { AiOutputLanguage, AiRequestPreview } from '@core/contracts/ai-request'

import { AiRequestPreviewDialog } from '@/components/ai-request-preview-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

import { problemStatusLabels, relationTypeLabels } from './problem-labels'

interface ProblemAnalysisDialogProps {
  onCreated: (problem: Problem) => void
  onOpenChange: (open: boolean) => void
  open: boolean
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

export function ProblemAnalysisDialog({
  onCreated,
  onOpenChange,
  open,
}: ProblemAnalysisDialogProps) {
  const { locale, t } = useI18n()
  const [candidateTypes, setCandidateTypes] = useState<Record<string, RelationType>>({})
  const [draft, setDraft] = useState<ProblemAnalysisDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<CreateProblemRequest | null>(null)
  const [images, setImages] = useState<ProblemAnalysisImage[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [outputLanguage, setOutputLanguage] = useState<AiOutputLanguage>(locale)
  const [requestPreview, setRequestPreview] = useState<AiRequestPreview | null>(null)
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [tagsText, setTagsText] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    if (!open) return
    setCandidateTypes({})
    setDraft(null)
    setError(null)
    setFields(null)
    setImages([])
    setIsBusy(false)
    setOutputLanguage(locale)
    setRequestPreview(null)
    setSelectedCandidates(new Set())
    setTagsText('')
    setText('')
  }, [locale, open])

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
    setError(null)
    setIsBusy(true)
    try {
      const result = await window.desktop.problemAnalysis.analyze({
        images,
        outputLanguage,
        text,
      })
      setRequestPreview(null)
      setDraft(result)
      setFields(result.fields)
      setTagsText(result.fields.tags.join(', '))
      setSelectedCandidates(new Set(result.candidates.map(candidate => candidate.templateId)))
      setCandidateTypes(
        Object.fromEntries(
          result.candidates.map(candidate => [candidate.templateId, candidate.relationType]),
        ),
      )
    } catch (caught) {
      setError(t(errorMessage(caught)))
    } finally {
      setIsBusy(false)
    }
  }

  const previewAnalysis = async () => {
    setError(null)
    setIsBusy(true)
    try {
      setRequestPreview(
        await window.desktop.problemAnalysis.preview({ images, outputLanguage, text }),
      )
    } catch (caught) {
      setError(t(errorMessage(caught)))
    } finally {
      setIsBusy(false)
    }
  }

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    if (!fields || !draft) return
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
        relations: draft.candidates
          .filter(candidate => selectedCandidates.has(candidate.templateId))
          .map(candidate => ({
            note: candidate.reason,
            relationType: candidateTypes[candidate.templateId] ?? 'recommended',
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

  const updateCandidate = (candidate: ProblemAnalysisCandidate, checked: boolean) => {
    setSelectedCandidates(current => {
      const next = new Set(current)
      if (checked) next.add(candidate.templateId)
      else next.delete(candidate.templateId)
      return next
    })
  }

  const inputClass =
    'mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring'

  return (
    <Dialog.Root onOpenChange={openValue => !isBusy && onOpenChange(openValue)} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-overlay/60 backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby="problem-analysis-description"
          className="dialog-surface fixed left-1/2 top-1/2 z-50 flex h-[min(850px,calc(100vh-24px))] w-[min(980px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-primary/18 bg-panel shadow-2xl outline-none ring-1 ring-white/8"
          onInteractOutside={event => isBusy && event.preventDefault()}
        >
          <header className="flex items-start border-b border-border px-5 py-4">
            <span className="mr-3 grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <div>
              <Dialog.Title className="text-sm font-semibold">
                {t(draft ? '确认 AI 题目草稿' : 'AI 分析题目')}
              </Dialog.Title>
              <Dialog.Description
                className="mt-1 text-xs text-muted-foreground"
                id="problem-analysis-description"
              >
                {draft
                  ? t('由 {provider} · {model} 生成，确认前不会写入题库。', {
                      model: draft.model,
                      provider: draft.providerName,
                    })
                  : t('输入题面、选择截图或直接粘贴图片；分析结果仅形成可编辑草稿。')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                aria-label={t('关闭 AI 题目分析')}
                className="ml-auto"
                disabled={isBusy}
                size="close"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </header>

          {error && (
            <div
              className="flex items-start gap-2 border-b border-red-500/20 bg-red-500/7 px-5 py-2.5 text-xs text-red-700 dark:text-red-300"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{t(error)}</span>
              <button
                aria-label={t('关闭分析错误')}
                className="ml-auto rounded p-0.5 hover:bg-red-500/10"
                onClick={() => setError(null)}
                type="button"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {!draft || !fields ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <section className="rounded-2xl border border-border bg-background/55 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold">{t('题面输入')}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('支持纯文本、截图，或在文本框内按 Cmd/Ctrl+V 粘贴图片。')}
                    </p>
                  </div>
                  <Button
                    disabled={isBusy || images.length >= 6}
                    onClick={() => void chooseImages()}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    <ImagePlus className="size-3.5" />
                    {t('选择截图')}
                  </Button>
                  <label className="ml-auto flex items-center gap-2 text-[11px] font-medium">
                    {t('输出语言')}
                    <select
                      aria-label={t('题目分析输出语言')}
                      className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                      onChange={event => setOutputLanguage(event.target.value as AiOutputLanguage)}
                      value={outputLanguage}
                    >
                      <option value="zh-CN">{t('简体中文')}</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                </div>
                <textarea
                  aria-label={t('待分析题面')}
                  autoFocus
                  className="mt-4 min-h-64 w-full resize-y rounded-xl border border-border bg-panel px-4 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  maxLength={100_000}
                  onChange={event => setText(event.target.value)}
                  onPaste={event => void handlePaste(event)}
                  placeholder={t('粘贴题目描述、输入输出与数据范围…')}
                  value={text}
                />
              </section>

              <section className="mt-4 rounded-2xl border border-border bg-background/55 p-5">
                <div className="flex items-center gap-3">
                  <FileImage className="size-4 text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-semibold">{t('分析图片')}</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {images.length} / 6 {t('张')} · {t('单张')} 8 MiB · {t('合计')} 24 MiB
                    </p>
                  </div>
                </div>
                {images.length === 0 ? (
                  <div className="mt-4 grid min-h-32 place-items-center rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                    {t('图片只用于本次分析，确认草稿后才会保存。')}
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {images.map((image, index) => (
                      <article
                        className="flex items-center gap-3 rounded-xl border border-border bg-panel p-2.5"
                        key={`${image.name}-${index}`}
                      >
                        <img
                          alt={image.name}
                          className="size-12 rounded-lg border border-border object-cover"
                          src={image.dataUrl}
                        />
                        <span className="min-w-0 flex-1 truncate text-xs">{image.name}</span>
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
                          <Trash2 className="size-3.5" />
                        </Button>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <footer className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
                <p className="text-[11px] text-muted-foreground">
                  {t('发送前会显示当前任务 Provider；分析不会自动创建题目。')}
                </p>
                <div className="flex gap-2">
                  <Dialog.Close asChild>
                    <Button disabled={isBusy} type="button" variant="outline">
                      {t('取消')}
                    </Button>
                  </Dialog.Close>
                  <Button
                    disabled={isBusy || (!text.trim() && images.length === 0)}
                    onClick={() => void previewAnalysis()}
                    type="button"
                  >
                    {isBusy ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {t('生成草稿')}
                  </Button>
                </div>
              </footer>
            </div>
          ) : (
            <form
              className="min-h-0 flex-1 overflow-y-auto p-5"
              onSubmit={event => void confirm(event)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold sm:col-span-2">
                  {t('题目标题')}
                  <input
                    aria-label={t('AI 草稿题目标题')}
                    className={inputClass}
                    maxLength={200}
                    onChange={event =>
                      setFields(current => current && { ...current, title: event.target.value })
                    }
                    required
                    value={fields.title}
                  />
                </label>
                <label className="text-xs font-semibold">
                  {t('平台')}
                  <input
                    aria-label={t('AI 草稿平台')}
                    className={inputClass}
                    onChange={event =>
                      setFields(
                        current =>
                          current && { ...current, platform: nullable(event.target.value) },
                      )
                    }
                    value={fields.platform ?? ''}
                  />
                </label>
                <label className="text-xs font-semibold">
                  {t('题号')}
                  <input
                    aria-label={t('AI 草稿题号')}
                    className={inputClass}
                    onChange={event =>
                      setFields(
                        current =>
                          current && { ...current, problemCode: nullable(event.target.value) },
                      )
                    }
                    value={fields.problemCode ?? ''}
                  />
                </label>
                <label className="text-xs font-semibold">
                  {t('难度')}
                  <input
                    aria-label={t('AI 草稿难度')}
                    className={inputClass}
                    onChange={event =>
                      setFields(
                        current =>
                          current && { ...current, difficulty: nullable(event.target.value) },
                      )
                    }
                    value={fields.difficulty ?? ''}
                  />
                </label>
                <label className="text-xs font-semibold">
                  {t('状态')}
                  <select
                    aria-label={t('AI 草稿状态')}
                    className={inputClass}
                    onChange={event =>
                      setFields(
                        current =>
                          current && {
                            ...current,
                            status: event.target.value as CreateProblemRequest['status'],
                          },
                      )
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
                    aria-label={t('AI 草稿链接')}
                    className={inputClass}
                    onChange={event =>
                      setFields(
                        current => current && { ...current, url: nullable(event.target.value) },
                      )
                    }
                    type="url"
                    value={fields.url ?? ''}
                  />
                </label>
                <label className="text-xs font-semibold sm:col-span-2">
                  {t('标签')}
                  <input
                    aria-label={t('AI 草稿标签')}
                    className={inputClass}
                    onChange={event => setTagsText(event.target.value)}
                    value={tagsText}
                  />
                </label>
                <label className="text-xs font-semibold sm:col-span-2">
                  {t('原始题面')}
                  <textarea
                    aria-label={t('AI 草稿原始题面')}
                    className="mt-1.5 min-h-32 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
                    readOnly
                    value={fields.statement}
                  />
                </label>
                <label className="text-xs font-semibold sm:col-span-2">
                  {t('AI 题目摘要')}
                  <textarea
                    aria-label={t('AI 草稿题目摘要')}
                    className="mt-1.5 min-h-24 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
                    onChange={event =>
                      setFields(current => current && { ...current, aiSummary: event.target.value })
                    }
                    value={fields.aiSummary}
                  />
                </label>
                {(
                  [
                    ['inputDescription', '输入说明'],
                    ['outputDescription', '输出说明'],
                  ] as const
                ).map(([key, label]) => (
                  <label className="text-xs font-semibold" key={key}>
                    {t(label)}
                    <textarea
                      aria-label={t(`AI 草稿${label}`)}
                      className="mt-1.5 min-h-20 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-xs leading-5 outline-none focus:ring-2 focus:ring-ring"
                      onChange={event =>
                        setFields(current =>
                          current
                            ? {
                                ...current,
                                analysis: { ...current.analysis, [key]: event.target.value },
                              }
                            : current,
                        )
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
                  <label className="text-xs font-semibold sm:col-span-2" key={key}>
                    {t(label)}
                    <textarea
                      aria-label={t(`AI 草稿${label}`)}
                      className="mt-1.5 min-h-20 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-xs leading-5 outline-none focus:ring-2 focus:ring-ring"
                      onChange={event =>
                        setFields(current =>
                          current
                            ? {
                                ...current,
                                analysis: {
                                  ...current.analysis,
                                  [key]: event.target.value
                                    .split('\n')
                                    .map(item => item.trim())
                                    .filter(Boolean),
                                },
                              }
                            : current,
                        )
                      }
                      value={fields.analysis[key].join('\n')}
                    />
                  </label>
                ))}
                {fields.analysis.examples.map((example, index) => (
                  <section
                    className="grid gap-2 rounded-xl border border-border bg-muted/25 p-3 sm:col-span-2 sm:grid-cols-2"
                    key={index}
                  >
                    <p className="text-xs font-semibold sm:col-span-2">
                      {t('样例')} {index + 1}
                    </p>
                    {(['input', 'output', 'explanation'] as const).map(key => (
                      <label
                        className={`text-[11px] font-medium ${key === 'explanation' ? 'sm:col-span-2' : ''}`}
                        key={key}
                      >
                        {t(key === 'input' ? '输入' : key === 'output' ? '输出' : '解释')}
                        <textarea
                          className="mt-1 min-h-16 w-full resize-y rounded-lg border border-border bg-background p-2 font-mono text-[11px] outline-none focus:ring-2 focus:ring-ring"
                          onChange={event =>
                            setFields(current => {
                              if (!current) return current
                              const examples = current.analysis.examples.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, [key]: event.target.value } : item,
                              )
                              return {
                                ...current,
                                analysis: { ...current.analysis, examples },
                              }
                            })
                          }
                          value={example[key]}
                        />
                      </label>
                    ))}
                  </section>
                ))}
                <label className="text-xs font-semibold sm:col-span-2">
                  {t('本地备注')}
                  <textarea
                    aria-label={t('AI 草稿本地备注')}
                    className="mt-1.5 min-h-20 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
                    onChange={event =>
                      setFields(current => current && { ...current, notes: event.target.value })
                    }
                    value={fields.notes}
                  />
                </label>
              </div>

              <section className="mt-5 rounded-2xl border border-border bg-background/55 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{t('候选模板关联')}</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t('仅保留你确认的候选；创建后仍可手动调整。')}
                    </p>
                  </div>
                  <Badge>
                    {selectedCandidates.size} {t('个将写入')}
                  </Badge>
                </div>
                {draft.candidates.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    {t('AI 没有找到可靠的本地模板候选。')}
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {draft.candidates.map(candidate => (
                      <article
                        className="flex items-center gap-3 rounded-xl border border-border bg-panel p-3"
                        key={candidate.templateId}
                      >
                        <label className="grid size-8 shrink-0 place-items-center">
                          <input
                            aria-label={`${t('选择候选模板')} ${candidate.templateName}`}
                            checked={selectedCandidates.has(candidate.templateId)}
                            className="size-4 accent-primary"
                            onChange={event => updateCandidate(candidate, event.target.checked)}
                            type="checkbox"
                          />
                        </label>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {candidate.templateName}
                            </span>
                            <Badge>{Math.round(candidate.confidence * 100)}%</Badge>
                          </div>
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">
                            {candidate.templatePath}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {candidate.reason}
                          </p>
                          {candidate.evidence.length > 0 && (
                            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                              <span className="font-semibold text-foreground">
                                {t('题面证据')}：
                              </span>
                              {candidate.evidence.join('、')}
                            </p>
                          )}
                          {candidate.applicableWhen.length > 0 && (
                            <p className="mt-1 text-[11px] leading-5 text-success">
                              <span className="font-semibold">{t('适用条件')}：</span>
                              {candidate.applicableWhen.join('、')}
                            </p>
                          )}
                          {candidate.notApplicableWhen.length > 0 && (
                            <p className="mt-1 text-[11px] leading-5 text-warning">
                              <span className="font-semibold">{t('不适用条件')}：</span>
                              {candidate.notApplicableWhen.join('、')}
                            </p>
                          )}
                          {candidate.warnings.length > 0 && (
                            <p className="mt-1 text-[11px] leading-5 text-red-600 dark:text-red-300">
                              <span className="font-semibold">{t('使用前警告')}：</span>
                              {candidate.warnings.join('、')}
                            </p>
                          )}
                        </div>
                        <select
                          aria-label={`${candidate.templateName} ${t('关系类型')}`}
                          className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                          disabled={!selectedCandidates.has(candidate.templateId)}
                          onChange={event =>
                            setCandidateTypes(current => ({
                              ...current,
                              [candidate.templateId]: event.target.value as RelationType,
                            }))
                          }
                          value={candidateTypes[candidate.templateId] ?? 'recommended'}
                        >
                          {Object.entries(relationTypeLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {t(label)}
                            </option>
                          ))}
                        </select>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <footer className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
                <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Check className="size-3.5 text-success" />
                  {t('确认后才会保存题目、{count} 张图片和关联。', { count: images.length })}
                </p>
                <div className="flex gap-2">
                  <Button
                    disabled={isBusy}
                    onClick={() => setDraft(null)}
                    type="button"
                    variant="outline"
                  >
                    {t('返回修改输入')}
                  </Button>
                  <Button disabled={isBusy || !fields.title.trim()} type="submit">
                    {isBusy && <LoaderCircle className="size-4 animate-spin" />}
                    {t('确认创建')}
                  </Button>
                </div>
              </footer>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
      {requestPreview && (
        <AiRequestPreviewDialog
          busy={isBusy}
          onCancel={() => setRequestPreview(null)}
          onConfirm={() => void executeAnalysis()}
          preview={requestPreview}
        />
      )}
    </Dialog.Root>
  )
}

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

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
  const [candidateTypes, setCandidateTypes] = useState<Record<string, RelationType>>({})
  const [draft, setDraft] = useState<ProblemAnalysisDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<CreateProblemRequest | null>(null)
  const [images, setImages] = useState<ProblemAnalysisImage[]>([])
  const [isBusy, setIsBusy] = useState(false)
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
    setSelectedCandidates(new Set())
    setTagsText('')
    setText('')
  }, [open])

  const chooseImages = async () => {
    setError(null)
    try {
      const chosen = await window.desktop.problemAnalysis.chooseImages()
      if (images.length + chosen.length > 6) {
        setError('单次题目分析最多添加 6 张图片。')
        return
      }
      setImages(current => [...current, ...chosen])
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()
    if (images.length + files.length > 6) {
      setError('单次题目分析最多添加 6 张图片。')
      return
    }
    try {
      const pasted = await Promise.all(files.map(readClipboardImage))
      setImages(current => [...current, ...pasted])
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const analyze = async () => {
    setError(null)
    setIsBusy(true)
    try {
      const result = await window.desktop.problemAnalysis.analyze({ images, text })
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
      setError(errorMessage(caught))
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
      setError(errorMessage(caught))
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay/60 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby="problem-analysis-description"
          className="fixed left-1/2 top-1/2 z-50 flex h-[min(850px,calc(100vh-24px))] w-[min(980px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl outline-none"
          onInteractOutside={event => isBusy && event.preventDefault()}
        >
          <header className="flex items-start border-b border-border px-5 py-4">
            <span className="mr-3 grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <div>
              <Dialog.Title className="text-sm font-semibold">
                {draft ? '确认 AI 题目草稿' : 'AI 分析题目'}
              </Dialog.Title>
              <Dialog.Description
                className="mt-1 text-xs text-muted-foreground"
                id="problem-analysis-description"
              >
                {draft
                  ? `由 ${draft.providerName} · ${draft.model} 生成，确认前不会写入题库。`
                  : '输入题面、选择截图或直接粘贴图片；分析结果仅形成可编辑草稿。'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                aria-label="关闭 AI 题目分析"
                className="ml-auto"
                disabled={isBusy}
                size="icon"
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
              <span>{error}</span>
              <button
                aria-label="关闭分析错误"
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
                    <h3 className="text-sm font-semibold">题面输入</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      支持纯文本、截图，或在文本框内按 Cmd/Ctrl+V 粘贴图片。
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
                    选择截图
                  </Button>
                </div>
                <textarea
                  aria-label="待分析题面"
                  autoFocus
                  className="mt-4 min-h-64 w-full resize-y rounded-xl border border-border bg-panel px-4 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  maxLength={100_000}
                  onChange={event => setText(event.target.value)}
                  onPaste={event => void handlePaste(event)}
                  placeholder="粘贴题目描述、输入输出与数据范围…"
                  value={text}
                />
              </section>

              <section className="mt-4 rounded-2xl border border-border bg-background/55 p-5">
                <div className="flex items-center gap-3">
                  <FileImage className="size-4 text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-semibold">分析图片</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {images.length} / 6 张 · 单张 8 MiB · 合计 24 MiB
                    </p>
                  </div>
                </div>
                {images.length === 0 ? (
                  <div className="mt-4 grid min-h-32 place-items-center rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                    图片只用于本次分析，确认草稿后才会保存。
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
                          aria-label={`移除分析图片 ${image.name}`}
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
                  发送前会显示当前任务 Provider；分析不会自动创建题目。
                </p>
                <div className="flex gap-2">
                  <Dialog.Close asChild>
                    <Button disabled={isBusy} type="button" variant="outline">
                      取消
                    </Button>
                  </Dialog.Close>
                  <Button
                    disabled={isBusy || (!text.trim() && images.length === 0)}
                    onClick={() => void analyze()}
                    type="button"
                  >
                    {isBusy ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    生成草稿
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
                  题目标题
                  <input
                    aria-label="AI 草稿题目标题"
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
                  平台
                  <input
                    aria-label="AI 草稿平台"
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
                  题号
                  <input
                    aria-label="AI 草稿题号"
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
                  难度
                  <input
                    aria-label="AI 草稿难度"
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
                  状态
                  <select
                    aria-label="AI 草稿状态"
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
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold sm:col-span-2">
                  题目链接
                  <input
                    aria-label="AI 草稿链接"
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
                  标签
                  <input
                    aria-label="AI 草稿标签"
                    className={inputClass}
                    onChange={event => setTagsText(event.target.value)}
                    value={tagsText}
                  />
                </label>
                <label className="text-xs font-semibold sm:col-span-2">
                  题面摘要
                  <textarea
                    aria-label="AI 草稿题面摘要"
                    className="mt-1.5 min-h-32 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
                    onChange={event =>
                      setFields(current => current && { ...current, statement: event.target.value })
                    }
                    value={fields.statement}
                  />
                </label>
                <label className="text-xs font-semibold sm:col-span-2">
                  本地备注
                  <textarea
                    aria-label="AI 草稿本地备注"
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
                    <h3 className="text-sm font-semibold">候选模板关联</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      仅保留你确认的候选；创建后仍可手动调整。
                    </p>
                  </div>
                  <Badge>{selectedCandidates.size} 个将写入</Badge>
                </div>
                {draft.candidates.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    AI 没有找到可靠的本地模板候选。
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
                            aria-label={`选择候选模板 ${candidate.templateName}`}
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
                        </div>
                        <select
                          aria-label={`${candidate.templateName} 关系类型`}
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
                              {label}
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
                  确认后才会保存题目、{images.length} 张图片和关联。
                </p>
                <div className="flex gap-2">
                  <Button
                    disabled={isBusy}
                    onClick={() => setDraft(null)}
                    type="button"
                    variant="outline"
                  >
                    返回修改输入
                  </Button>
                  <Button disabled={isBusy || !fields.title.trim()} type="submit">
                    {isBusy && <LoaderCircle className="size-4 animate-spin" />}
                    确认创建
                  </Button>
                </div>
              </footer>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

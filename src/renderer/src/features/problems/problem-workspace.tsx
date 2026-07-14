import {
  AlertTriangle,
  BookOpenText,
  Check,
  Edit3,
  FileImage,
  FileText,
  ImagePlus,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import type {
  CreateProblemRequest,
  Problem,
  ProblemTemplateRelation,
  RemoveProblemImageRequest,
  RemoveProblemRelationRequest,
  UpdateProblemRequest,
  UpsertProblemRelationRequest,
} from '@core/contracts/problem'
import type { TemplateSummary } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { ProblemEditorDialog } from './problem-editor-dialog'
import { ProblemImageCard } from './problem-image-card'
import { problemStatusLabels, relationTypeLabels } from './problem-labels'
import { RelationDialog } from './relation-dialog'

interface ProblemWorkspaceProps {
  error: string | null
  isBusy: boolean
  isLoading: boolean
  onAddImages: (problemId: string) => Promise<Problem | null>
  onClearError: () => void
  onCreate: (request: CreateProblemRequest) => Promise<Problem | null>
  onOpenTemplate: (templateId: string) => void
  onRemoveImage: (request: RemoveProblemImageRequest) => Promise<Problem | null>
  onRemoveRelation: (request: RemoveProblemRelationRequest) => Promise<Problem | null>
  onSelect: (problemId: string) => void
  onUpdate: (request: UpdateProblemRequest) => Promise<Problem | null>
  onUpsertRelation: (request: UpsertProblemRelationRequest) => Promise<Problem | null>
  problems: Problem[]
  selectedProblemId: string | null
  templates: TemplateSummary[]
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

export function ProblemWorkspace({
  error,
  isBusy,
  isLoading,
  onAddImages,
  onClearError,
  onCreate,
  onOpenTemplate,
  onRemoveImage,
  onRemoveRelation,
  onSelect,
  onUpdate,
  onUpsertRelation,
  problems,
  selectedProblemId,
  templates,
}: ProblemWorkspaceProps) {
  const [confirmRemoveTemplateId, setConfirmRemoveTemplateId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null)
  const [query, setQuery] = useState('')
  const [relationEditorOpen, setRelationEditorOpen] = useState(false)
  const [editingRelation, setEditingRelation] = useState<ProblemTemplateRelation | null>(null)

  const selectedProblem = problems.find(problem => problem.id === selectedProblemId) ?? null
  const filteredProblems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN')
    if (!normalized) {
      return problems
    }
    return problems.filter(problem =>
      [
        problem.title,
        problem.platform,
        problem.problemCode,
        problem.difficulty,
        problem.tags.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('zh-CN')
        .includes(normalized),
    )
  }, [problems, query])

  const relationTemplates = useMemo(() => {
    if (!selectedProblem) {
      return []
    }
    if (editingRelation) {
      return templates.filter(template => template.id === editingRelation.templateId)
    }
    const relatedIds = new Set(selectedProblem.relations.map(relation => relation.templateId))
    return templates.filter(template => !relatedIds.has(template.id))
  }, [editingRelation, selectedProblem, templates])

  const openCreateEditor = () => {
    onClearError()
    setEditingProblem(null)
    setEditorOpen(true)
  }

  const openEditEditor = () => {
    if (!selectedProblem) {
      return
    }
    onClearError()
    setEditingProblem(selectedProblem)
    setEditorOpen(true)
  }

  const handleSaveProblem = async (fields: CreateProblemRequest) => {
    const saved = editingProblem
      ? await onUpdate({ ...fields, id: editingProblem.id })
      : await onCreate(fields)
    if (saved) {
      onSelect(saved.id)
      return true
    }
    return false
  }

  const openRelationEditor = (relation: ProblemTemplateRelation | null) => {
    onClearError()
    setEditingRelation(relation)
    setRelationEditorOpen(true)
  }

  const handleSaveRelation = async (request: UpsertProblemRelationRequest) =>
    Boolean(await onUpsertRelation(request))

  return (
    <main className="flex min-h-0 flex-col overflow-hidden">
      <header className="flex min-h-14 items-center gap-3 border-b border-border bg-panel px-4 py-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold">题目卡片</h1>
            <Badge>{problems.length} 道题</Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">本地题库与模板关联</p>
        </div>
        <Button className="ml-auto" onClick={openCreateEditor} size="compact" type="button">
          <Plus aria-hidden="true" className="size-3.5" />
          新建题目
        </Button>
      </header>

      {error && !editorOpen && !relationEditorOpen && (
        <div
          className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/7 px-4 py-2 text-xs text-red-700 dark:text-red-300"
          role="alert"
        >
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
          <span>{error}</span>
          <button
            aria-label="关闭题目错误提示"
            className="ml-auto rounded p-1 hover:bg-red-500/10"
            onClick={onClearError}
            type="button"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col border-r border-border bg-sidebar/65">
          <div className="border-b border-border p-3">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 shadow-xs focus-within:ring-2 focus-within:ring-ring">
              <Search aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <input
                aria-label="筛选题目卡片"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索标题、题号或标签"
                value={query}
              />
            </div>
            <p className="mt-2 px-1 text-[10px] text-muted-foreground">
              {query ? `${filteredProblems.length} 个匹配结果` : '按最近修改排序'}
            </p>
          </div>

          {isLoading ? (
            <div className="grid flex-1 place-items-center">
              <LoaderCircle className="size-5 animate-spin text-primary" />
            </div>
          ) : filteredProblems.length === 0 ? (
            <div className="grid flex-1 place-items-center p-6 text-center">
              <div>
                <BookOpenText className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-3 text-xs font-medium">
                  {query ? '没有匹配题目' : '还没有题目卡片'}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  {query ? '尝试缩短关键词。' : '手动创建第一道题，不需要配置 AI。'}
                </p>
                {!query && (
                  <Button className="mt-4" onClick={openCreateEditor} size="compact" type="button">
                    创建第一道题
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredProblems.map(problem => {
                const selected = problem.id === selectedProblemId
                return (
                  <button
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                      selected ? 'bg-primary/12 text-primary' : 'text-foreground hover:bg-muted',
                    )}
                    key={problem.id}
                    onClick={() => onSelect(problem.id)}
                    type="button"
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                        selected ? 'bg-primary/12' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <BookOpenText aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{problem.title}</span>
                      <span className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                        {problem.platform ?? '未设置平台'}
                        {problem.problemCode && ` · ${problem.problemCode}`}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{problemStatusLabels[problem.status]}</span>
                        <span>{problem.relations.length} 个模板</span>
                        <span className="ml-auto">{formatUpdatedAt(problem.updatedAt)}</span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {!selectedProblem ? (
          <section className="grid min-h-0 place-items-center bg-background p-8 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <BookOpenText aria-hidden="true" className="size-6" />
              </span>
              <h2 className="mt-4 text-sm font-semibold">选择一道题目</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                查看题面、备注、图片和关联模板；解除关联不会影响两侧数据。
              </p>
            </div>
          </section>
        ) : (
          <section className="min-h-0 overflow-y-auto bg-background">
            <header className="border-b border-border bg-panel px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight">
                      {selectedProblem.title}
                    </h2>
                    <Badge tone={selectedProblem.status === 'solved' ? 'success' : 'accent'}>
                      {problemStatusLabels[selectedProblem.status]}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {[
                      selectedProblem.platform,
                      selectedProblem.problemCode,
                      selectedProblem.difficulty,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '尚未补充平台、题号和难度'}
                  </p>
                </div>
                <Button onClick={openEditEditor} size="compact" type="button" variant="outline">
                  <Edit3 aria-hidden="true" className="size-3.5" />
                  编辑
                </Button>
              </div>
              {selectedProblem.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {selectedProblem.tags.map(tag => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              )}
            </header>

            <div className="space-y-4 p-5 lg:p-6">
              <section className="rounded-2xl border border-border bg-panel p-5 shadow-xs">
                <div className="flex items-center gap-2">
                  <FileText aria-hidden="true" className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">题面与备注</h3>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-xl border border-border bg-muted/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      题面摘要
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                      {selectedProblem.statement || '尚未记录题面摘要。'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      本地备注
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                      {selectedProblem.notes || '尚未添加本地备注。'}
                    </p>
                  </div>
                </div>
                {selectedProblem.url && (
                  <p
                    className="mt-3 truncate text-[11px] text-muted-foreground"
                    title={selectedProblem.url}
                  >
                    来源链接：{selectedProblem.url}
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-panel p-5 shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Link2 aria-hidden="true" className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">关联模板</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {selectedProblem.relations.length} 个已确认关联
                    </p>
                  </div>
                  <Button
                    className="ml-auto"
                    disabled={relationTemplates.length === 0 || isBusy}
                    onClick={() => openRelationEditor(null)}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                    添加关联
                  </Button>
                </div>

                {selectedProblem.relations.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/25 p-5 text-center text-xs text-muted-foreground">
                    尚未关联模板。你可以从当前工作区选择一个或多个算法模板。
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {selectedProblem.relations.map(relation => (
                      <article
                        className="flex items-center gap-3 rounded-xl border border-border bg-background/70 px-3 py-3"
                        key={relation.templateId}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          {relation.available ? (
                            <Check aria-hidden="true" className="size-4 text-success" />
                          ) : (
                            <AlertTriangle aria-hidden="true" className="size-4 text-warning" />
                          )}
                        </span>
                        <button
                          className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          disabled={!relation.available}
                          onClick={() => onOpenTemplate(relation.templateId)}
                          type="button"
                        >
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {relation.templateName}
                            </span>
                            <Badge>{relationTypeLabels[relation.relationType]}</Badge>
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {relation.available
                              ? relation.templatePath
                              : '模板当前不可用，关联已保留'}
                          </span>
                          {relation.note && (
                            <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                              {relation.note}
                            </span>
                          )}
                        </button>
                        {confirmRemoveTemplateId === relation.templateId ? (
                          <div className="flex gap-1">
                            <Button
                              disabled={isBusy}
                              onClick={() => {
                                void onRemoveRelation({
                                  problemId: selectedProblem.id,
                                  templateId: relation.templateId,
                                }).then(result => {
                                  if (result) {
                                    setConfirmRemoveTemplateId(null)
                                  }
                                })
                              }}
                              size="compact"
                              type="button"
                              variant="outline"
                            >
                              确认解除
                            </Button>
                            <Button
                              onClick={() => setConfirmRemoveTemplateId(null)}
                              size="compact"
                              type="button"
                              variant="ghost"
                            >
                              取消
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              aria-label={`编辑与 ${relation.templateName} 的关联`}
                              disabled={!relation.available}
                              onClick={() => openRelationEditor(relation)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Edit3 aria-hidden="true" className="size-3.5" />
                            </Button>
                            <Button
                              aria-label={`解除与 ${relation.templateName} 的关联`}
                              onClick={() => setConfirmRemoveTemplateId(relation.templateId)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 aria-hidden="true" className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-panel p-5 shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <FileImage aria-hidden="true" className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">题目图片</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {selectedProblem.images.length} / 12 张 · 本地保存
                    </p>
                  </div>
                  <Button
                    className="ml-auto"
                    disabled={isBusy || selectedProblem.images.length >= 12}
                    onClick={() => void onAddImages(selectedProblem.id)}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    <ImagePlus aria-hidden="true" className="size-3.5" />
                    添加图片
                  </Button>
                </div>
                {selectedProblem.images.length === 0 ? (
                  <div className="mt-4 grid min-h-28 place-items-center rounded-xl border border-dashed border-border bg-muted/25 text-center">
                    <div>
                      <FileImage className="mx-auto size-5 text-muted-foreground" />
                      <p className="mt-2 text-xs text-muted-foreground">
                        支持 PNG、JPEG、WebP，单张最大 8 MiB。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {selectedProblem.images.map(image => (
                      <ProblemImageCard
                        image={image}
                        isBusy={isBusy}
                        key={image.id}
                        onRemove={imageId =>
                          void onRemoveImage({ imageId, problemId: selectedProblem.id })
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
        )}
      </div>

      <ProblemEditorDialog
        error={error}
        isBusy={isBusy}
        onOpenChange={open => {
          setEditorOpen(open)
          if (!open) {
            onClearError()
          }
        }}
        onSave={handleSaveProblem}
        open={editorOpen}
        problem={editingProblem}
      />
      {selectedProblem && (
        <RelationDialog
          error={error}
          existing={editingRelation}
          isBusy={isBusy}
          onOpenChange={open => {
            setRelationEditorOpen(open)
            if (!open) {
              onClearError()
              setEditingRelation(null)
            }
          }}
          onSave={handleSaveRelation}
          open={relationEditorOpen}
          problemId={selectedProblem.id}
          templates={relationTemplates}
        />
      )}
    </main>
  )
}

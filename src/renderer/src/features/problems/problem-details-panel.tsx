import {
  AlertTriangle,
  Check,
  Edit3,
  FileImage,
  FileText,
  ImagePlus,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import type {
  Problem,
  ProblemTemplateRelation,
  RemoveProblemImageRequest,
  RemoveProblemRelationRequest,
} from '@core/contracts/problem'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

import { ProblemImageCard } from './problem-image-card'
import { problemStatusLabels, relationTypeLabels } from './problem-labels'

interface ProblemDetailsPanelProps {
  isBusy: boolean
  onAddImages: (problemId: string) => Promise<Problem | null>
  onDelete: (problemId: string) => Promise<boolean>
  onDeleted: () => void
  onOpenEditor: () => void
  onOpenRelationEditor: (relation: ProblemTemplateRelation | null) => void
  onOpenTemplate: (templateId: string) => void
  onRemoveImage: (request: RemoveProblemImageRequest) => Promise<Problem | null>
  onRemoveRelation: (request: RemoveProblemRelationRequest) => Promise<Problem | null>
  problem: Problem
  templateTotalCount: number
}

export function ProblemDetailsPanel({
  isBusy,
  onAddImages,
  onDelete,
  onDeleted,
  onOpenEditor,
  onOpenRelationEditor,
  onOpenTemplate,
  onRemoveImage,
  onRemoveRelation,
  problem,
  templateTotalCount,
}: ProblemDetailsPanelProps) {
  const { t } = useI18n()
  const [confirmRemoveTemplateId, setConfirmRemoveTemplateId] = useState<string | null>(null)
  const [confirmDeleteProblem, setConfirmDeleteProblem] = useState(false)

  useEffect(() => {
    setConfirmDeleteProblem(false)
    setConfirmRemoveTemplateId(null)
  }, [problem.id])

  return (
    <section
      aria-label={t('题目详情面板')}
      className="h-full min-h-0 overflow-y-auto overscroll-contain bg-background/75 outline-none [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      role="region"
      tabIndex={0}
    >
      <header className="relative overflow-hidden border-b border-success/12 bg-panel px-6 py-5 shadow-xs">
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-success" />
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-20 size-56 rounded-full bg-success/8 blur-3xl"
        />
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative min-w-0 flex-1">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-success">
              {t('当前题目')}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="min-w-0 break-words text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {problem.title}
              </h2>
              <Badge tone={problem.status === 'solved' ? 'success' : 'accent'}>
                {t(problemStatusLabels[problem.status])}
              </Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {[problem.platform, problem.problemCode, problem.difficulty]
                .filter(Boolean)
                .join(' · ') || t('尚未补充平台、题号和难度')}
            </p>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            {confirmDeleteProblem ? (
              <>
                <span className="text-[11px] text-red-600 dark:text-red-300">
                  {t('将删除题目、图片与关联')}
                </span>
                <Button
                  disabled={isBusy}
                  onClick={() => {
                    void onDelete(problem.id).then(deleted => {
                      if (deleted) {
                        setConfirmDeleteProblem(false)
                        onDeleted()
                      }
                    })
                  }}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  {t('确认删除')}
                </Button>
                <Button
                  onClick={() => setConfirmDeleteProblem(false)}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  {t('取消')}
                </Button>
              </>
            ) : (
              <>
                <Button onClick={onOpenEditor} size="compact" type="button" variant="outline">
                  <Edit3 aria-hidden="true" className="size-3.5" />
                  {t('编辑')}
                </Button>
                <Button
                  aria-label={`${t('删除题目')} ${problem.title}`}
                  disabled={isBusy}
                  onClick={() => setConfirmDeleteProblem(true)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" className="size-4 text-red-500" />
                </Button>
              </>
            )}
          </div>
        </div>
        {problem.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {problem.tags.map(tag => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        )}
      </header>

      <div className="space-y-4 p-5 lg:p-6">
        <section className="rounded-2xl border border-border bg-panel p-5 shadow-panel">
          <div className="flex items-center gap-2">
            <FileText aria-hidden="true" className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('题面与备注')}</h3>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface-subtle/65 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('原始题面')}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                {problem.statement || t('尚未记录原始题面。')}
              </p>
            </div>
            <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('AI 题目摘要')}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                {problem.aiSummary || t('尚未生成 AI 题目摘要。')}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-subtle/65 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('本地备注')}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                {problem.notes || t('尚未添加本地备注。')}
              </p>
            </div>
          </div>
          {Boolean(
            problem.analysis.inputDescription ||
            problem.analysis.outputDescription ||
            problem.analysis.constraints.length ||
            problem.analysis.algorithmSignals.length ||
            problem.analysis.edgeCases.length ||
            problem.analysis.examples.length,
          ) && (
            <div className="mt-4 grid gap-3 rounded-xl border border-border bg-background/55 p-4 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('输入说明')}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5">
                  {problem.analysis.inputDescription || t('未提取')}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('输出说明')}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5">
                  {problem.analysis.outputDescription || t('未提取')}
                </p>
              </div>
              {(
                [
                  ['constraints', '数据约束'],
                  ['algorithmSignals', '算法信号'],
                  ['edgeCases', '边界情况'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(label)}
                  </p>
                  <p className="mt-1 text-xs leading-5">
                    {problem.analysis[key].join('、') || t('未提取')}
                  </p>
                </div>
              ))}
            </div>
          )}
          {problem.url && (
            <p className="mt-3 truncate text-[11px] text-muted-foreground" title={problem.url}>
              {t('来源链接')}：{problem.url}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-panel p-5 shadow-panel">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-success/11 text-success ring-1 ring-success/12">
              <Link2 aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">{t('关联模板')}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {problem.relations.length} {t('个已确认关联')}
              </p>
            </div>
            <Button
              className="ml-auto"
              disabled={templateTotalCount <= problem.relations.length || isBusy}
              onClick={() => onOpenRelationEditor(null)}
              size="compact"
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              {t('添加关联')}
            </Button>
          </div>

          {problem.relations.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/25 p-5 text-center text-xs text-muted-foreground">
              {t('尚未关联模板。你可以从当前工作区选择一个或多个算法模板。')}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {problem.relations.map(relation => (
                <article
                  className="interactive-lift flex items-center gap-3 rounded-xl border border-border bg-background/70 px-3 py-3 hover:border-success/25"
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
                      <span className="truncate text-sm font-medium">{relation.templateName}</span>
                      <Badge>{t(relationTypeLabels[relation.relationType])}</Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {relation.available ? relation.templatePath : t('模板当前不可用，关联已保留')}
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
                            problemId: problem.id,
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
                        {t('确认解除')}
                      </Button>
                      <Button
                        onClick={() => setConfirmRemoveTemplateId(null)}
                        size="compact"
                        type="button"
                        variant="ghost"
                      >
                        {t('取消')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <Button
                        aria-label={`${t('编辑与模板的关联')} ${relation.templateName}`}
                        disabled={!relation.available}
                        onClick={() => onOpenRelationEditor(relation)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Edit3 aria-hidden="true" className="size-3.5" />
                      </Button>
                      <Button
                        aria-label={`${t('解除与模板的关联')} ${relation.templateName}`}
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

        <section className="rounded-2xl border border-border bg-panel p-5 shadow-panel">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-pink/10 text-accent-pink ring-1 ring-accent-pink/12">
              <FileImage aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">{t('题目图片')}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {problem.images.length} / 12 {t('张')} · {t('本地保存')}
              </p>
            </div>
            <Button
              className="ml-auto"
              disabled={isBusy || problem.images.length >= 12}
              onClick={() => void onAddImages(problem.id)}
              size="compact"
              type="button"
              variant="outline"
            >
              <ImagePlus aria-hidden="true" className="size-3.5" />
              {t('添加图片')}
            </Button>
          </div>
          {problem.images.length === 0 ? (
            <div className="mt-4 grid min-h-28 place-items-center rounded-xl border border-dashed border-border bg-muted/25 text-center">
              <div>
                <FileImage className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('支持 PNG、JPEG、WebP，单张最大 8 MiB。')}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {problem.images.map(image => (
                <ProblemImageCard
                  image={image}
                  isBusy={isBusy}
                  key={image.id}
                  onRemove={imageId => void onRemoveImage({ imageId, problemId: problem.id })}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

import { Download, FileClock, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  FileChangeOperation,
  FileChangePlan,
  TemplateMetadataFields,
} from '@core/contracts/template-management'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

export interface FileManagementPlanReviewSelectionPreset {
  operationIds: string[]
  planId: string
}

export interface FileManagementPlanReviewPanelProps {
  busyAction: string | null
  draftPlan: FileChangePlan | null
  onApplyPlan: (planId: string, operationIds: string[]) => Promise<boolean>
  onCancelPlan: (planId: string) => void
  onExportDiagnostic: (planId: string) => void | Promise<void>
  selectionPreset: FileManagementPlanReviewSelectionPreset | null
}

function operationLabel(operation: FileChangeOperation): string {
  if (operation.kind === 'move') return '移动 / 重命名'
  if (operation.kind === 'delete') return '删除重复文件'
  return '更新算法元数据'
}

function operationGroupLabel(operation: FileChangeOperation): string {
  const source = operation.source === 'local-audit' ? '本地审计' : 'AI 建议'
  const risk =
    operation.risk === 'high' ? '高风险' : operation.risk === 'medium' ? '中风险' : '低风险'
  return `${source} · ${operationLabel(operation)} · ${risk}`
}

const metadataFieldLabels: Array<[keyof TemplateMetadataFields, string]> = [
  ['solves', '解决问题'],
  ['constraints', '适用约束'],
  ['prerequisites', '前置条件'],
  ['commonMistakes', '常见错误'],
  ['timeComplexity', '时间复杂度'],
  ['spaceComplexity', '空间复杂度'],
  ['tags', '标签'],
  ['notes', '用户笔记'],
]

function metadataValue(value: TemplateMetadataFields[keyof TemplateMetadataFields]): string {
  if (Array.isArray(value)) return value.join('、') || '无'
  return value?.trim() || '无'
}

function metadataDiff(operation: Extract<FileChangeOperation, { kind: 'update-metadata' }>) {
  return metadataFieldLabels.flatMap(([field, label]) => {
    const next = metadataValue(operation.metadata[field])
    const previous = metadataValue(operation.previousMetadata[field])
    return previous === next ? [] : [{ field, label, next, previous }]
  })
}

export function FileManagementPlanReviewPanel({
  busyAction,
  draftPlan,
  onApplyPlan,
  onCancelPlan,
  onExportDiagnostic,
  selectionPreset,
}: FileManagementPlanReviewPanelProps) {
  const { t } = useI18n()
  const [confirmApply, setConfirmApply] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () =>
      new Set(
        selectionPreset && selectionPreset.planId === draftPlan?.id
          ? selectionPreset.operationIds
          : undefined,
      ),
  )
  const confirmApplyButtonRef = useRef<HTMLButtonElement>(null)
  const confirmApplyTriggerRef = useRef<HTMLButtonElement>(null)
  const operationGroups = useMemo(() => {
    const groups = new Map<string, FileChangeOperation[]>()
    for (const operation of draftPlan?.operations ?? []) {
      const label = operationGroupLabel(operation)
      groups.set(label, [...(groups.get(label) ?? []), operation])
    }
    return [...groups.entries()]
  }, [draftPlan])

  useEffect(() => {
    if (confirmApply) confirmApplyButtonRef.current?.focus()
  }, [confirmApply])

  const closeApplyConfirmation = () => {
    setConfirmApply(false)
    window.requestAnimationFrame(() => confirmApplyTriggerRef.current?.focus())
  }

  const confirmSelectedOperations = async () => {
    if (!draftPlan) return
    const applied = await onApplyPlan(draftPlan.id, [...selectedIds])
    if (applied) setConfirmApply(false)
  }

  return (
    <section className="rounded-2xl border border-warning/18 bg-panel p-5 shadow-focus">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t('待确认变更计划')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('勾选要执行的项目，未选项目不会写入。')}
          </p>
        </div>
        {draftPlan && (
          <Badge tone="warning">
            {draftPlan.providerName} · {draftPlan.model}
          </Badge>
        )}
      </div>
      {!draftPlan ? (
        <div className="mt-4 grid min-h-48 place-items-center rounded-xl border border-dashed border-warning/20 bg-warning/4 text-center">
          <div>
            <span className="mx-auto grid size-10 place-items-center rounded-xl bg-warning/10 text-warning">
              <FileClock className="size-5" />
            </span>
            <p className="mt-3 text-xs font-medium">{t('没有待确认计划')}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('建议先运行只读扫描，再请求 AI 生成计划。')}
            </p>
          </div>
        </div>
      ) : draftPlan.operations.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
          {t('AI 没有生成通过本地安全校验的操作。可取消本计划后重试。')}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {draftPlan.summary && (
            <p className="rounded-xl border border-warning/18 bg-warning/5 p-3 text-xs leading-5">
              {draftPlan.summary}
            </p>
          )}
          {operationGroups.map(([group, operations]) => (
            <section key={group}>
              <div className="mb-2 flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(operations[0]?.source === 'local-audit' ? '本地审计' : 'AI 建议')} ·{' '}
                  {t(operationLabel(operations[0]!))} ·{' '}
                  {t(
                    operations[0]?.risk === 'high'
                      ? '高风险'
                      : operations[0]?.risk === 'medium'
                        ? '中风险'
                        : '低风险',
                  )}
                </p>
                <Badge tone="neutral">{operations.length}</Badge>
              </div>
              <div className="space-y-2">
                {operations.map(operation => (
                  <label
                    className="interactive-lift flex gap-3 rounded-xl border border-border bg-background/65 p-3 hover:border-warning/25"
                    key={operation.id}
                  >
                    <input
                      aria-label={`${t('选择操作')} ${operation.sourcePath}`}
                      checked={selectedIds.has(operation.id)}
                      className="mt-1 size-4 accent-warning"
                      onChange={event =>
                        setSelectedIds(current => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(operation.id)
                          else next.delete(operation.id)
                          return next
                        })
                      }
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <Badge>{t(operationLabel(operation))}</Badge>
                        <span className="break-all">{operation.sourcePath}</span>
                        {!operation.selectedByDefault && (
                          <Badge tone="accent">{t('需手动选择')}</Badge>
                        )}
                      </span>
                      {operation.kind === 'move' && (
                        <span className="mt-2 block rounded-lg bg-muted px-3 py-2 font-mono text-[11px]">
                          − {operation.sourcePath}
                          <br />+ {operation.targetPath}
                        </span>
                      )}
                      {operation.kind === 'delete' && (
                        <span className="mt-2 block rounded-lg bg-red-500/5 px-3 py-2 font-mono text-[11px] text-red-600 dark:text-red-300">
                          − {operation.sourcePath}
                        </span>
                      )}
                      {operation.kind === 'update-metadata' && (
                        <span className="mt-2 block space-y-2 rounded-lg bg-muted px-3 py-2 text-[11px]">
                          {metadataDiff(operation).map(change => (
                            <span className="block" key={change.field}>
                              <span className="flex items-center gap-2 font-semibold">
                                {t(change.label)}
                                {change.field === 'notes' && (
                                  <Badge tone="accent">{t('高风险')}</Badge>
                                )}
                              </span>
                              <span className="mt-1 block break-words font-mono text-[10px] text-muted-foreground">
                                − {change.previous}
                              </span>
                              <span className="block break-words font-mono text-[10px]">
                                + {change.next}
                              </span>
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="mt-2 block text-[11px] leading-5 text-muted-foreground">
                        {operation.reason}
                      </span>
                      {operation.evidence.length > 0 && (
                        <span className="mt-2 block text-[11px] leading-5">
                          <strong>{t('证据')}：</strong> {operation.evidence.join('；')}
                        </span>
                      )}
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {t('置信度')}：{Math.round(operation.confidence * 100)}%
                        {operation.applicability.length > 0 &&
                          ` · ${t('适用条件')}：${operation.applicability.join('；')}`}
                      </span>
                      {operation.alternatives.length > 0 && (
                        <span className="mt-1 block text-[10px] text-muted-foreground">
                          {t('备选方案')}：{operation.alternatives.join('；')}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {draftPlan && (
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Button
              disabled={Boolean(busyAction)}
              onClick={() => onCancelPlan(draftPlan.id)}
              size="compact"
              type="button"
              variant="ghost"
            >
              {t('取消计划')}
            </Button>
            <Button
              disabled={Boolean(busyAction)}
              onClick={() => void onExportDiagnostic(draftPlan.id)}
              size="compact"
              type="button"
              variant="ghost"
            >
              <Download className="size-3.5" />
              {t('安全诊断')}
            </Button>
          </div>
          {confirmApply ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-warning">
                {t('将备份后执行 {count} 项操作', { count: selectedIds.size })}
              </span>
              <Button
                disabled={Boolean(busyAction) || selectedIds.size === 0}
                onClick={() => void confirmSelectedOperations()}
                ref={confirmApplyButtonRef}
                size="compact"
                type="button"
              >
                <Play className="size-3.5" />
                {t('确认执行')}
              </Button>
              <Button
                onClick={closeApplyConfirmation}
                size="compact"
                type="button"
                variant="outline"
              >
                {t('返回')}
              </Button>
            </div>
          ) : (
            <Button
              disabled={selectedIds.size === 0 || Boolean(busyAction)}
              onClick={() => setConfirmApply(true)}
              ref={confirmApplyTriggerRef}
              size="compact"
              type="button"
              variant="outline"
            >
              {t('预览并执行')}
            </Button>
          )}
        </footer>
      )}
    </section>
  )
}

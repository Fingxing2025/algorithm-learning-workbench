import { FolderSearch } from 'lucide-react'

import type { BackgroundTaskStatus } from '@core/contracts/background-task'
import type { WorkspaceAudit } from '@core/contracts/template-management'

import { Badge } from '@/components/ui/badge'
import { backgroundTaskProgressText } from '@/lib/background-task'
import { useI18n } from '@/lib/i18n'

type AuditIssue = WorkspaceAudit['issues'][number]

const auditIssueLabels: Record<AuditIssue['kind'], string> = {
  'duplicate-content': '完全重复',
  'empty-file': '空文件',
  'invalid-name': '命名异常',
  'missing-metadata': '缺失元数据',
  'similar-content': '高度相似',
  'stale-relation': '失效关联',
}

function auditIssueDetail(
  issue: AuditIssue,
  t: (source: string, variables?: Record<string, number | string>) => string,
): string {
  if (issue.kind === 'missing-metadata') return t('算法卡片尚未补充结构化元数据。')
  if (issue.kind === 'invalid-name')
    return t('文件名可能包含副本标记或不一致空格，建议人工确认命名。')
  if (issue.kind === 'empty-file') return t('模板文件为空。')
  if (issue.kind === 'duplicate-content')
    return t('这些模板源码规范化后完全相同；建议仅保留 {path}。', {
      path: issue.paths[0] ?? '',
    })
  if (issue.kind === 'similar-content')
    return t('这些模板源码高度相似；建议仅保留 {path}，执行前请查看源码确认。', {
      path: issue.paths[0] ?? '',
    })
  return t('模板关联指向当前不可用的模板。')
}

export interface FileManagementAuditPanelProps {
  audit: WorkspaceAudit | null
  auditTask: BackgroundTaskStatus | null
}

export function FileManagementAuditPanel({ audit, auditTask }: FileManagementAuditPanelProps) {
  const { locale, t } = useI18n()

  return (
    <section className="rounded-2xl border border-border bg-panel p-4 shadow-panel">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-success/10 text-success">
          <FolderSearch className="size-4" />
        </span>
        <h2 className="text-sm font-semibold">{t('只读审计')}</h2>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {auditTask && ['queued', 'running', 'cancelling'].includes(auditTask.state)
          ? backgroundTaskProgressText(auditTask, t)
          : audit
            ? `${audit.issues.length} ${t('项')} · ${new Date(audit.generatedAt).toLocaleTimeString(locale)}`
            : t('尚未扫描')}
      </p>
      {audit?.truncated && audit.truncatedReason && (
        <div className="mt-3 rounded-xl border border-warning/30 bg-warning/8 p-3 text-[11px] leading-5 text-foreground">
          <p className="whitespace-pre-line">
            {audit.truncatedReason
              .split('\n')
              .map(reason => t(reason))
              .join('\n')}
          </p>
          {audit.nextAction && <p className="mt-1 text-muted-foreground">{t(audit.nextAction)}</p>}
        </div>
      )}
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
        {audit?.issues.slice(0, 40).map(issue => (
          <article
            className="rounded-xl border border-border bg-background/60 p-2.5"
            key={issue.id}
          >
            <div className="flex items-center gap-2">
              <Badge tone={issue.severity === 'warning' ? 'accent' : 'neutral'}>
                {t(auditIssueLabels[issue.kind])}
              </Badge>
              <span className="truncate text-[11px] font-medium">{issue.paths.join('、')}</span>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              {auditIssueDetail(issue, t)}
            </p>
          </article>
        ))}
        {audit && audit.issues.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {t('未发现确定性问题。')}
          </p>
        )}
      </div>
    </section>
  )
}

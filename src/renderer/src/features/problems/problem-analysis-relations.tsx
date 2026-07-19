import { Link2, Plus, Search, X } from 'lucide-react'

import type { ProblemAnalysisCandidate } from '@core/contracts/problem-analysis'
import type { RelationType } from '@core/contracts/problem'
import type { TemplateSummary } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

import { relationTypeLabels } from './problem-labels'

export interface RelationDraft extends ProblemAnalysisCandidate {
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

export interface ProblemAnalysisRelationsProps {
  availableManualTemplates: TemplateSummary[]
  onAddManualTemplate: () => void
  onRemoveRelation: (templateId: string) => void
  onSearchQueryChange: (value: string) => void
  onSelectCandidate: (templateId: string, selected: boolean) => void
  onSelectManualTemplate: (templateId: string) => void
  onUpdateRelation: (templateId: string, patch: Partial<RelationDraft>) => void
  relationDrafts: RelationDraft[]
  selectedCandidates: Set<string>
  selectedManualTemplateId: string
  templateQuery: string
}

export function ProblemAnalysisRelations({
  availableManualTemplates,
  onAddManualTemplate,
  onRemoveRelation,
  onSearchQueryChange,
  onSelectCandidate,
  onSelectManualTemplate,
  onUpdateRelation,
  relationDrafts,
  selectedCandidates,
  selectedManualTemplateId,
  templateQuery,
}: ProblemAnalysisRelationsProps) {
  const { t } = useI18n()

  return (
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
            onChange={event => onSearchQueryChange(event.target.value)}
            placeholder={t('名称、路径或语言')}
            value={templateQuery}
          />
        </label>
        <select
          aria-label={t('选择本地模板')}
          className="h-9 min-w-40 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          disabled={relationDrafts.length >= 8 || availableManualTemplates.length === 0}
          onChange={event => onSelectManualTemplate(event.target.value)}
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
          onClick={onAddManualTemplate}
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
                  onChange={event => onSelectCandidate(candidate.templateId, event.target.checked)}
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
                  onClick={() => onRemoveRelation(candidate.templateId)}
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
                  {candidate.evidence.length > 0 && ` · ${candidate.evidence.join('、')}`}
                </p>
              )}
              <div className="mt-2 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
                <select
                  aria-label={`${candidate.templateName} ${t('关系类型')}`}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                  disabled={!selectedCandidates.has(candidate.templateId)}
                  onChange={event =>
                    onUpdateRelation(candidate.templateId, {
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
                    onUpdateRelation(candidate.templateId, { note: event.target.value })
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
  )
}

import type { TemplateClassification } from '@core/contracts/template-management'
import { useI18n } from '@/lib/i18n'

const reasonLabels: Record<string, string> = {
  'partial-source-coverage': '详细源码未完整覆盖',
  'missing-implementation-evidence': '缺少实现代码引用，名称或注释不足以判断',
  'missing-source-evidence': '缺少源码引用',
  'invalid-source-evidence': '源码引用未通过本地核验',
  'unknown-algorithm-family': '算法族未知或存在歧义',
  'composite-algorithm': '包含多个算法族',
  'low-confidence': '模型置信度较低',
  'close-alternatives': '候选分类接近',
  'new-category-proposal': '新增分类仅为待确认提案',
  'model-conflict': '模型报告判断冲突',
  'generic-category': '当前是泛化分类',
  'family-category-disagreement': '算法族与主分类存在分歧',
  'family-disagreement': '同算法族的多个来源分类不一致',
  'global-detail-disagreement': '全局摘要与详细源码结论存在分歧',
  'partial-global-coverage': '全局摘要未完整覆盖源码',
  'unverified-global-evidence': '全局摘要缺少有效源码引用',
  'low-global-confidence': '全局提案置信度较低',
}

type EvidenceReview = Pick<
  TemplateClassification,
  | 'sourceCoverage'
  | 'sourceEvidence'
  | 'reviewReasons'
  | 'proposalHistory'
  | 'variant'
  | 'secondaryFamilies'
>

export function ClassificationEvidenceReview({ value }: { value: EvidenceReview }) {
  const { t } = useI18n()
  return (
    <div className="min-w-0 space-y-1 text-xs leading-5 sm:col-span-2">
      {value.variant && (
        <p>
          {t('实现变体')}：{value.variant}
        </p>
      )}
      {Boolean(value.secondaryFamilies?.length) && (
        <p>
          {t('辅助算法族')}：{value.secondaryFamilies!.join('、')}
        </p>
      )}
      {Boolean(value.reviewReasons?.length) && (
        <p className="text-amber-800 dark:text-amber-200">
          {t('待复核原因')}：
          {value.reviewReasons!.map(reason => t(reasonLabels[reason] ?? '需要人工复核')).join('；')}
        </p>
      )}
      {value.sourceCoverage && (
        <p className="text-muted-foreground">
          {t('源码覆盖')}：{value.sourceCoverage.coveredLines}/{value.sourceCoverage.totalLines}{' '}
          {t('行')} · {t('遗漏')} {value.sourceCoverage.omittedLines} {t('行')}
        </p>
      )}
      {(Boolean(value.sourceEvidence?.length) || Boolean(value.proposalHistory?.length)) && (
        <details className="min-w-0">
          <summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring">
            {t('查看源码证据与提案版本')}
          </summary>
          <p className="text-muted-foreground">
            {t('引用核验只确认文字与位置，不证明算法判断正确。')}
          </p>
          {value.sourceEvidence?.map((evidence, index) => (
            <div key={index} className="my-2 rounded border border-border p-2">
              <p>
                L{evidence.startLine}–L{evidence.endLine} ·{' '}
                {t(evidence.verified ? '源码引用已核对' : '引用未通过核验')}
              </p>
              <p>{evidence.claim}</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">
                {evidence.quote}
              </pre>
            </div>
          ))}
          {value.proposalHistory?.map(proposal => (
            <div key={proposal.version} className="my-2 border-l-2 border-border pl-2">
              <p>
                v{proposal.version} ·{' '}
                {t(proposal.source === 'global-summary' ? '全局初步提案' : '详细源码提案')} ·{' '}
                {proposal.categoryPath.join(' / ') || proposal.categoryId || t('待分类')}
              </p>
              <p>
                {proposal.algorithmFamily} · {proposal.primaryTechnique} · {proposal.variant} ·{' '}
                {proposal.timeComplexity} / {proposal.spaceComplexity}
              </p>
              <p className="text-muted-foreground">
                {t('源码覆盖')}：{proposal.sourceCoverage.coveredLines}/
                {proposal.sourceCoverage.totalLines} {t('行')}
              </p>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

import { motion, useReducedMotion } from 'motion/react'

import type { Problem } from '@core/contracts/problem'
import type { WorkspaceSnapshot } from '@core/contracts/workspace'
import {
  ArrowRight,
  BookOpenText,
  ChevronRight,
  CircleDot,
  FileCode2,
  FolderOpen,
  GitBranch,
  Plus,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function SummaryCard({
  destination,
  icon: Icon,
  label,
  note,
  onClick,
  tone,
  value,
}: {
  destination: string
  icon: LucideIcon
  label: string
  note: string
  onClick: () => void
  tone: 'amber' | 'indigo' | 'teal'
  value: string
}) {
  const prefersReducedMotion = useReducedMotion()
  const toneClasses = {
    amber: 'bg-warning/12 text-warning ring-warning/15',
    indigo: 'bg-primary/11 text-primary ring-primary/15',
    teal: 'bg-success/12 text-success ring-success/15',
  }

  return (
    <motion.button
      aria-label={`${label}，${destination}`}
      className="summary-card group relative rounded-2xl border p-4 text-left shadow-panel outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring"
      data-tone={tone}
      onClick={onClick}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      type="button"
      variants={{
        hidden: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0 },
      }}
      whileHover={prefersReducedMotion ? undefined : { scale: 1.012, y: -3 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.992 }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            'grid size-9 place-items-center rounded-xl ring-1 ring-inset',
            toneClasses[tone],
          )}
        >
          <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-3 text-[28px] font-semibold leading-none tracking-[-0.035em] text-foreground">
        {value}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">{note}</p>
      <ArrowRight
        aria-hidden="true"
        className="absolute bottom-4 right-4 size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
      />
    </motion.button>
  )
}

export function Dashboard({
  onCreateTemplate,
  onChangeWorkspace,
  onOpenAi,
  onOpenProblem,
  onOpenProblems,
  onOpenTemplate,
  onOpenTemplates,
  pendingPlanCount,
  problemTotalCount,
  problems,
  totalRelationCount,
  workspace,
}: {
  onChangeWorkspace: () => void
  onCreateTemplate: () => void
  onOpenAi: () => void
  onOpenProblem: (problemId: string) => void
  onOpenProblems: () => void
  onOpenTemplate: (templateId: string) => void
  onOpenTemplates: () => void
  pendingPlanCount: number
  problemTotalCount: number
  problems: Problem[]
  totalRelationCount: number
  workspace: WorkspaceSnapshot
}) {
  const { t } = useI18n()
  const prefersReducedMotion = useReducedMotion()
  const templateOverview = workspace.templates.slice(0, 5)
  const recentProblems = problems.slice(0, 5)

  return (
    <main
      aria-label={t('工作台')}
      className="dashboard-scroll relative h-full min-h-0 overflow-y-auto overscroll-contain px-5 py-5 lg:px-8 lg:py-7"
      data-testid="dashboard-scroll-region"
    >
      <div
        aria-hidden="true"
        className="app-grid-texture pointer-events-none absolute inset-x-0 top-0 h-72 opacity-45"
      />
      <div className="relative mx-auto max-w-[1120px]">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-hero relative overflow-hidden rounded-[24px] border px-5 py-6 lg:px-7 lg:py-7"
          data-ui="dashboard-hero"
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <span aria-hidden="true" className="orbital-rings" />
          <div
            aria-hidden="true"
            className="absolute -right-16 -top-24 size-72 rounded-full bg-primary/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 right-1/3 size-56 rounded-full bg-success/8 blur-3xl"
          />
          <div className="dashboard-hero-layout relative grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col justify-center">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                <CircleDot aria-hidden="true" className="size-3.5 fill-success/15 text-success" />
                {workspace.name} · {t('本地工作区')}
              </div>
              <h1
                aria-label={t('工作台')}
                className="mt-3 text-[28px] font-semibold tracking-[-0.045em] lg:text-[34px]"
              >
                {t('让算法知识有清晰的节奏')}
              </h1>
              <p className="dashboard-hero-description mt-2 text-sm leading-6 text-muted-foreground">
                {t('管理本地模板、题目关联和 AI 文件计划。')}
              </p>
              <div className="dashboard-hero-chips mt-4 flex flex-wrap gap-2">
                <span className="dashboard-hero-chip">
                  <span className="size-1.5 rounded-full bg-cyan-300" /> {t('本地优先')}
                </span>
                <span className="dashboard-hero-chip">{t('模板与题目双向关联')}</span>
                <span className="dashboard-hero-chip">{t('AI 变更先预览')}</span>
              </div>
              <div className="dashboard-hero-actions mt-5 flex flex-wrap gap-2">
                <Button
                  className="dashboard-hero-action"
                  onClick={onOpenProblems}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  <BookOpenText aria-hidden="true" className="size-3.5" />
                  {t('浏览题目')}
                </Button>
                <Button
                  className="dashboard-hero-action"
                  onClick={onOpenTemplates}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  <FolderOpen aria-hidden="true" className="size-3.5" />
                  {t('浏览模板库')}
                </Button>
                <Button
                  className="dashboard-hero-action"
                  onClick={onChangeWorkspace}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  <FolderOpen aria-hidden="true" className="size-3.5" />
                  {t('切换工作区')}
                </Button>
                <Button
                  className="border border-white/18 bg-white text-indigo-700 shadow-lg hover:bg-white/90"
                  onClick={onCreateTemplate}
                  size="compact"
                  type="button"
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  {t('新建模板')}
                </Button>
              </div>
            </div>

            <aside aria-label={t('知识脉络概览')} className="hero-knowledge-map">
              <div className="relative flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-white/55">
                    Knowledge graph
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-white">{t('知识脉络')}</h2>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-2 py-1 text-[9px] font-medium text-white/70">
                  <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgb(110_231_183/0.8)]" />
                  {t('当前索引')}
                </span>
              </div>
              <div className="knowledge-flow relative mt-4 flex items-center justify-between">
                <div className="knowledge-flow-node" data-tone="cyan">
                  <FileCode2 aria-hidden="true" className="size-4" />
                  <strong>{workspace.summary.templateCount}</strong>
                  <span>{t('模板')}</span>
                </div>
                <span aria-hidden="true" className="knowledge-flow-line" />
                <div className="knowledge-flow-node" data-tone="amber">
                  <GitBranch aria-hidden="true" className="size-4" />
                  <strong>{totalRelationCount}</strong>
                  <span>{t('关联')}</span>
                </div>
                <span aria-hidden="true" className="knowledge-flow-line" />
                <div className="knowledge-flow-node" data-tone="coral">
                  <BookOpenText aria-hidden="true" className="size-4" />
                  <strong>{problemTotalCount}</strong>
                  <span>{t('题目')}</span>
                </div>
              </div>
              <p className="relative mt-3 border-t border-white/10 pt-3 text-[10px] leading-4 text-white/58">
                {t('关系双向可见，源码与学习记录始终保存在本地。')}
              </p>
            </aside>
          </div>
        </motion.section>

        <motion.section
          animate="show"
          aria-label={t('知识库概览')}
          className="dashboard-summary-grid mt-6 grid gap-3 sm:grid-cols-3"
          initial="hidden"
          transition={{ delayChildren: 0.12, staggerChildren: 0.06 }}
        >
          <SummaryCard
            destination={t('打开模板库')}
            icon={FileCode2}
            label={t('算法模板')}
            note={t('已索引的本地源码')}
            onClick={onOpenTemplates}
            tone="indigo"
            value={String(workspace.summary.templateCount)}
          />
          <SummaryCard
            destination={t('打开题目库')}
            icon={BookOpenText}
            label={t('题目卡片')}
            note={t('整理题面与模板关联')}
            onClick={onOpenProblems}
            tone="teal"
            value={String(problemTotalCount)}
          />
          <SummaryCard
            destination={t('打开 AI 管理')}
            icon={Sparkles}
            label={t('待确认计划')}
            note={t(pendingPlanCount > 0 ? '需要你审查后才会执行' : '当前没有待处理变更')}
            onClick={onOpenAi}
            tone="amber"
            value={String(pendingPlanCount)}
          />
        </motion.section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
          <section
            className="content-card rounded-2xl border border-border p-5 shadow-panel"
            data-tone="primary"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{t('模板概览')}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t('从当前索引快速打开模板')}</p>
              </div>
              <button
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onOpenTemplates}
                type="button"
              >
                {t('查看全部')}
                <ArrowRight aria-hidden="true" className="size-3" />
              </button>
            </div>

            {templateOverview.length > 0 ? (
              <div className="mt-4 space-y-1.5">
                {templateOverview.map(template => (
                  <button
                    className="dashboard-list-row group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    key={template.id}
                    onClick={() => onOpenTemplate(template.id)}
                    type="button"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/9 text-primary ring-1 ring-primary/10">
                      <FileCode2 aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{template.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {template.relativePath}
                      </span>
                    </span>
                    <Badge>{template.language}</Badge>
                    <ChevronRight
                      aria-hidden="true"
                      className="dashboard-list-arrow size-3.5 text-muted-foreground"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid min-h-52 place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
                <div>
                  <FileCode2 aria-hidden="true" className="mx-auto size-7 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">{t('从第一份模板开始')}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t('新建源码文件后，它会立即进入本地索引。')}
                  </p>
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-4">
            <section
              className="content-card rounded-2xl border border-border p-5 shadow-panel"
              data-tone="coral"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{t('近期题目')}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('继续整理题面和模板关联')}
                  </p>
                </div>
                <button
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-success outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={onOpenProblems}
                  type="button"
                >
                  {t('查看全部')}
                  <ArrowRight aria-hidden="true" className="size-3" />
                </button>
              </div>
              {recentProblems.length > 0 ? (
                <div className="mt-4 space-y-1.5">
                  {recentProblems.map(problem => (
                    <button
                      className="dashboard-list-row group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      key={problem.id}
                      onClick={() => onOpenProblem(problem.id)}
                      type="button"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/10 text-success ring-1 ring-success/10">
                        <BookOpenText aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{problem.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {[problem.platform, problem.problemCode].filter(Boolean).join(' · ') ||
                            t('本地题目卡片')}
                        </span>
                      </span>
                      <Badge>
                        {problem.relations.length} {t('个模板')}
                      </Badge>
                      <ChevronRight
                        aria-hidden="true"
                        className="dashboard-list-arrow size-3.5 text-muted-foreground"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 grid min-h-40 place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
                  <div>
                    <BookOpenText className="mx-auto size-7 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">{t('创建第一张题目卡片')}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t('无需 AI，也能手动记录题面并关联模板。')}
                    </p>
                    <Button className="mt-4" onClick={onOpenProblems} size="compact" type="button">
                      {t('进入题目库')}
                    </Button>
                  </div>
                </div>
              )}
            </section>
            <section className="ai-spotlight relative overflow-hidden rounded-2xl border p-5 shadow-panel">
              <div
                aria-hidden="true"
                className="absolute -right-10 -top-12 size-32 rounded-full bg-warning/12 blur-2xl"
              />
              <div className="relative flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/14 text-warning ring-1 ring-warning/15">
                  <Sparkles aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">{t('AI 整理中心')}</h2>
                    {pendingPlanCount > 0 && (
                      <Badge tone="warning">
                        {pendingPlanCount} {t('项待审')}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    {pendingPlanCount > 0
                      ? t('有新的文件整理建议等待确认；执行前可逐项查看 Diff。')
                      : t('扫描重复模板、命名异常和缺失元数据，AI 只会先生成可审查计划。')}
                  </p>
                  <Button
                    className="mt-3"
                    onClick={onOpenAi}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    {t('打开 AI 管理')}
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}

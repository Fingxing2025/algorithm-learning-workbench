import * as Separator from '@radix-ui/react-separator'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  Boxes,
  Check,
  ChevronRight,
  CircleDot,
  Command,
  FileCode2,
  FolderOpen,
  GitBranch,
  Languages,
  LayoutDashboard,
  LoaderCircle,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'

import type { Problem, UpsertProblemRelationRequest } from '@core/contracts/problem'
import type {
  ChooseWorkspaceRequest,
  TemplateActionRequest,
  TemplateSummary,
  WorkspaceSnapshot,
} from '@core/contracts/workspace'
import type { ImportTemplateRequest } from '@core/contracts/template-management'

import { CommandPalette } from '@/components/command-palette'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProblemWorkspace } from '@/features/problems/problem-workspace'
import { useProblems } from '@/features/problems/use-problems'
import { CreateTemplateDialog } from '@/features/templates/create-template-dialog'
import { TemplateTree } from '@/features/templates/template-tree'
import { useTemplateSource } from '@/features/templates/use-template-source'
import { useWorkspace } from '@/features/templates/use-workspace'
import { WorkspaceOnboarding } from '@/features/templates/workspace-onboarding'
import { useRuntimeInfo } from '@/hooks/use-runtime-info'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'
import { I18nProvider, useI18n } from '@/lib/i18n'

const FileManagementWorkspace = lazy(async () => {
  const module = await import('@/features/ai/file-management-workspace')
  return { default: module.FileManagementWorkspace }
})

const AiProviderWorkspace = lazy(async () => {
  const module = await import('@/features/ai/ai-provider-workspace')
  return { default: module.AiProviderWorkspace }
})

const DataManagementWorkspace = lazy(async () => {
  const module = await import('@/features/data/data-management-workspace')
  return { default: module.DataManagementWorkspace }
})

const AlgorithmCard = lazy(async () => {
  const module = await import('@/features/templates/algorithm-card')
  return { default: module.AlgorithmCard }
})

type AppView = 'ai' | 'dashboard' | 'data' | 'problems' | 'settings' | 'templates'

interface NavigationItem {
  disabled?: boolean
  icon: LucideIcon
  id?: AppView
  label: string
  shortcut?: string
  tone: 'amber' | 'coral' | 'cyan' | 'indigo'
}

const navigationItems: NavigationItem[] = [
  { icon: LayoutDashboard, id: 'dashboard', label: '工作台', shortcut: '1', tone: 'indigo' },
  { icon: FileCode2, id: 'templates', label: '模板库', shortcut: '2', tone: 'cyan' },
  { icon: BookOpenText, id: 'problems', label: '题目', shortcut: '3', tone: 'coral' },
  { icon: Sparkles, id: 'ai', label: 'AI 管理', shortcut: '4', tone: 'amber' },
  { icon: ShieldCheck, id: 'data', label: '数据管理', shortcut: '5', tone: 'indigo' },
]

function NavigationButton({
  active,
  item,
  onSelect,
  shortcutLabel,
}: {
  active: boolean
  item: NavigationItem
  onSelect: (view: AppView) => void
  shortcutLabel?: string
}) {
  const { t } = useI18n()
  const Icon = item.icon
  const toneClasses = {
    amber: {
      active: 'bg-warning/13 text-warning shadow-xs ring-1 ring-warning/12',
      icon: 'bg-warning/12 text-warning',
      indicator: 'bg-warning',
    },
    coral: {
      active: 'bg-accent-coral/12 text-accent-coral shadow-xs ring-1 ring-accent-coral/12',
      icon: 'bg-accent-coral/11 text-accent-coral',
      indicator: 'bg-accent-coral',
    },
    cyan: {
      active: 'bg-accent-cyan/12 text-accent-cyan shadow-xs ring-1 ring-accent-cyan/12',
      icon: 'bg-accent-cyan/11 text-accent-cyan',
      indicator: 'bg-accent-cyan',
    },
    indigo: {
      active: 'bg-primary/12 text-primary shadow-xs ring-1 ring-primary/12',
      icon: 'bg-primary/11 text-primary',
      indicator: 'bg-primary',
    },
  }[item.tone]
  return (
    <button
      aria-current={active ? 'page' : undefined}
      aria-label={t(item.label)}
      className={cn(
        'group relative flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring',
        active && toneClasses.active,
        !active && !item.disabled && 'text-muted-foreground hover:bg-panel hover:text-foreground',
        item.disabled && 'cursor-not-allowed text-muted-foreground opacity-55',
      )}
      disabled={item.disabled}
      onClick={() => item.id && onSelect(item.id)}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-2 left-0 w-0.5 rounded-full opacity-0 transition-all duration-200',
          toneClasses.indicator,
          active && 'opacity-100',
        )}
      />
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-lg transition-all duration-200',
          active ? toneClasses.icon : 'bg-transparent',
        )}
      >
        <Icon
          aria-hidden="true"
          className="size-4 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3"
          strokeWidth={1.8}
        />
      </span>
      <span>{t(item.label)}</span>
      {item.disabled && (
        <span className="ml-auto text-[10px] font-medium uppercase">{t('稍后')}</span>
      )}
      {!item.disabled && shortcutLabel && (
        <kbd className="nav-shortcut ml-auto font-sans text-[9px] font-medium">{shortcutLabel}</kbd>
      )}
    </button>
  )
}

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

function WorkspaceUnavailable({
  isBusy,
  onChoose,
  workspace,
}: {
  isBusy: boolean
  onChoose: (request: ChooseWorkspaceRequest) => void
  workspace: WorkspaceSnapshot
}) {
  const { t } = useI18n()
  return (
    <main className="grid min-h-0 place-items-center overflow-y-auto p-8">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-panel p-7 text-center shadow-xs">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning/12 text-warning">
          <AlertTriangle aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">{t('原工作区当前不可用')}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t('工作区“{name}”可能已被移动、重命名或暂时卸载。应用没有修改其中的文件。', {
            name: workspace.name,
          })}
        </p>
        <Button
          className="mt-5"
          disabled={isBusy}
          onClick={() => onChoose({ intent: 'open' })}
          type="button"
        >
          <FolderOpen aria-hidden="true" className="size-4" />
          {t('切换工作区')}
        </Button>
      </section>
    </main>
  )
}

function Dashboard({
  onCreateTemplate,
  onOpenAi,
  onOpenProblem,
  onOpenProblems,
  onOpenTemplate,
  onOpenTemplates,
  pendingPlanCount,
  problems,
  workspace,
}: {
  onCreateTemplate: () => void
  onOpenAi: () => void
  onOpenProblem: (problemId: string) => void
  onOpenProblems: () => void
  onOpenTemplate: (templateId: string) => void
  onOpenTemplates: () => void
  pendingPlanCount: number
  problems: Problem[]
  workspace: WorkspaceSnapshot
}) {
  const { t } = useI18n()
  const prefersReducedMotion = useReducedMotion()
  const templateOverview = workspace.templates.slice(0, 5)
  const recentProblems = problems.slice(0, 5)
  const relationCount = problems.reduce((total, problem) => total + problem.relations.length, 0)

  return (
    <main
      aria-label={t('工作台')}
      className="relative h-full min-h-0 overflow-y-auto overscroll-contain px-5 py-5 lg:px-8 lg:py-7"
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
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('管理本地模板、题目关联和 AI 文件计划。')}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="dashboard-hero-chip">
                  <span className="size-1.5 rounded-full bg-cyan-300" /> {t('本地优先')}
                </span>
                <span className="dashboard-hero-chip">{t('模板与题目双向关联')}</span>
                <span className="dashboard-hero-chip">{t('AI 变更先预览')}</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
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
                  <strong>{relationCount}</strong>
                  <span>{t('关联')}</span>
                </div>
                <span aria-hidden="true" className="knowledge-flow-line" />
                <div className="knowledge-flow-node" data-tone="coral">
                  <BookOpenText aria-hidden="true" className="size-4" />
                  <strong>{problems.length}</strong>
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
          className="mt-6 grid gap-3 sm:grid-cols-3"
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
            value={String(problems.length)}
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

function TemplateLibrary({
  isBusy,
  isProblemBusy,
  onAction,
  onChangeWorkspace,
  onClearProblemError,
  onCreateTemplate,
  onDeleteTemplate,
  onOpenProblem,
  onRescan,
  onSelectTemplate,
  onUpsertProblemRelation,
  problemError,
  problems,
  revealTemplateId,
  selectedTemplate,
  selectedTemplateId,
  sourceState,
  onReloadSource,
  workspace,
}: {
  isBusy: boolean
  isProblemBusy: boolean
  onAction: (request: TemplateActionRequest) => void
  onChangeWorkspace: () => void
  onClearProblemError: () => void
  onCreateTemplate: () => void
  onDeleteTemplate: (templateId: string) => Promise<boolean>
  onOpenProblem: (problemId: string) => void
  onReloadSource: () => void
  onRescan: () => void
  onSelectTemplate: (templateId: string) => void
  onUpsertProblemRelation: (request: UpsertProblemRelationRequest) => Promise<boolean>
  problemError: string | null
  problems: Problem[]
  revealTemplateId: string | null
  selectedTemplate: TemplateSummary | null
  selectedTemplateId: string | null
  sourceState: ReturnType<typeof useTemplateSource>['state']
  workspace: WorkspaceSnapshot
}) {
  const { t } = useI18n()
  return (
    <main className="workspace-stage flex h-full min-h-0 flex-col overflow-hidden">
      <header className="glass-section-header flex min-h-[62px] flex-wrap items-center gap-3 border-b px-5 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-cyan/12 text-accent-cyan ring-1 ring-accent-cyan/14">
          <FileCode2 aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">{t('模板库')}</h1>
            <Badge tone="accent">
              {workspace.summary.templateCount} {t('个模板')}
            </Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            {workspace.name} · {t('本地索引')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            disabled={isBusy}
            onClick={onChangeWorkspace}
            size="compact"
            type="button"
            variant="ghost"
          >
            <FolderOpen aria-hidden="true" className="size-3.5" />
            {t('切换工作区')}
          </Button>
          <Button
            aria-label={t('重新扫描工作区')}
            disabled={isBusy}
            onClick={onRescan}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" className={cn('size-4', isBusy && 'animate-spin')} />
          </Button>
          <Button disabled={isBusy} onClick={onCreateTemplate} size="compact" type="button">
            <Plus aria-hidden="true" className="size-3.5" />
            {t('新建模板')}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,310px)_minmax(0,1fr)]">
        <TemplateTree
          onAction={onAction}
          onSelect={onSelectTemplate}
          revealTemplateId={revealTemplateId}
          selectedTemplateId={selectedTemplateId}
          templates={workspace.templates}
          workspaceId={workspace.id}
        />
        <Suspense
          fallback={
            <section className="grid min-h-0 place-items-center bg-background">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-5 animate-spin text-primary" />
                <p className="mt-2 text-xs text-muted-foreground">{t('正在准备源码查看器…')}</p>
              </div>
            </section>
          }
        >
          <AlgorithmCard
            onAction={onAction}
            onDelete={onDeleteTemplate}
            isProblemBusy={isProblemBusy || isBusy}
            onClearProblemError={onClearProblemError}
            onOpenProblem={onOpenProblem}
            onReload={onReloadSource}
            onUpsertProblemRelation={onUpsertProblemRelation}
            problemError={problemError}
            problems={problems}
            relatedProblems={problems.flatMap(problem => {
              const relation = problem.relations.find(
                item => item.templateId === selectedTemplate?.id,
              )
              return relation
                ? [{ id: problem.id, relationType: relation.relationType, title: problem.title }]
                : []
            })}
            sourceState={sourceState}
            template={selectedTemplate}
          />
        </Suspense>
      </div>
    </main>
  )
}

function AppContent() {
  const [commandOpen, setCommandOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [currentView, setCurrentView] = useState<AppView>('dashboard')
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingPlanCount, setPendingPlanCount] = useState(0)
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [revealTemplateId, setRevealTemplateId] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const { locale, t, toggleLocale } = useI18n()
  const runtimeState = useRuntimeInfo()
  const { theme, toggleTheme } = useTheme()
  const problemState = useProblems()
  const {
    chooseWorkspace,
    clearError: clearWorkspaceError,
    deleteTemplate,
    error: workspaceError,
    isBusy: isWorkspaceBusy,
    isLoading: isWorkspaceLoading,
    performTemplateAction,
    replaceWorkspace,
    importTemplate,
    rescan,
    workspace,
  } = useWorkspace()
  const source = useTemplateSource(selectedTemplateId)

  const selectedTemplate = useMemo(
    () => workspace?.templates.find(template => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, workspace],
  )

  useEffect(() => {
    if (currentView !== 'templates') setRevealTemplateId(null)
  }, [currentView])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
        return
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const target = event.target
      const isEditing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
      if (isEditing) return

      const key = event.key.toLowerCase()
      if (event.shiftKey && key === 'n' && workspace?.available) {
        event.preventDefault()
        setCreateOpen(true)
        return
      }

      const viewByShortcut: Partial<Record<string, AppView>> = {
        '1': 'dashboard',
        '2': 'templates',
        '3': 'problems',
        '4': 'ai',
        '5': 'data',
        ',': 'settings',
      }
      const nextView = viewByShortcut[key]
      if (nextView) {
        event.preventDefault()
        setCurrentView(nextView)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [workspace?.available])

  useEffect(() => {
    if (
      selectedTemplateId &&
      workspace &&
      !workspace.templates.some(template => template.id === selectedTemplateId)
    ) {
      setSelectedTemplateId(null)
    }
  }, [selectedTemplateId, workspace])

  useEffect(() => {
    if (
      selectedProblemId &&
      !problemState.problems.some(problem => problem.id === selectedProblemId)
    ) {
      setSelectedProblemId(null)
    }
  }, [problemState.problems, selectedProblemId])

  useEffect(() => {
    if (currentView === 'problems' && !selectedProblemId && problemState.problems[0]) {
      setSelectedProblemId(problemState.problems[0].id)
    }
  }, [currentView, problemState.problems, selectedProblemId])

  useEffect(() => {
    let active = true
    if (!workspace) {
      setPendingPlanCount(0)
      return
    }
    if (currentView !== 'dashboard') return
    void window.desktop.templateManagement
      .listFilePlans()
      .then(plans => {
        if (active) setPendingPlanCount(plans.filter(plan => plan.status === 'draft').length)
      })
      .catch(() => {
        if (active) setPendingPlanCount(0)
      })
    return () => {
      active = false
    }
  }, [currentView, workspace])

  useEffect(() => {
    if (!notice) {
      return
    }
    const timer = window.setTimeout(() => setNotice(null), 2400)
    return () => window.clearTimeout(timer)
  }, [notice])

  const platform = runtimeState.status === 'ready' ? runtimeState.value.platform : undefined
  const shortcutLabel = platform === 'darwin' ? '⌘K' : 'Ctrl K'
  const shortcutPrefix = platform === 'darwin' ? '⌘' : 'Ctrl '
  const createShortcutLabel = platform === 'darwin' ? '⌘⇧N' : 'Ctrl Shift N'

  const handleChooseWorkspace = async (request: ChooseWorkspaceRequest) => {
    const value = await chooseWorkspace(request)
    if (value) {
      setCurrentView('templates')
      setSelectedTemplateId(null)
      setNotice(t('已连接工作区“{name}”', { name: value.name }))
    }
  }

  const handleRescan = async () => {
    const value = await rescan()
    if (value) {
      setNotice(t('扫描完成：发现 {count} 个模板', { count: value.summary.templateCount }))
    }
  }

  const handleCreateTemplate = async (request: ImportTemplateRequest) => {
    const result = await importTemplate(request)
    if (!result) {
      return false
    }
    setCurrentView('templates')
    setSelectedTemplateId(result.templateId)
    setNotice(t('已创建 {path}', { path: request.relativePath }))
    return true
  }

  const handleTemplateAction = async (request: TemplateActionRequest) => {
    const succeeded = await performTemplateAction(request)
    if (succeeded) {
      const messageByAction = {
        'copy-relative-path': t('已复制相对路径'),
        'copy-source': t('已复制模板源码'),
        reveal: t('已在文件管理器中定位'),
      }
      setNotice(messageByAction[request.action])
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    const result = await deleteTemplate(templateId)
    if (!result) return false
    setSelectedTemplateId(null)
    void problemState.reload()
    setNotice(t('模板已备份并删除，可在 AI 管理的执行记录中撤销'))
    return true
  }

  const openTemplate = (templateId: string) => {
    setRevealTemplateId(templateId)
    setCurrentView('templates')
    setSelectedTemplateId(templateId)
  }

  const openProblem = (problemId: string) => {
    setCurrentView('problems')
    setSelectedProblemId(problemId)
  }

  const renderContent = () => {
    if (currentView === 'ai') {
      return (
        <Suspense
          fallback={
            <main className="grid h-full min-h-0 place-items-center">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
                <p className="mt-3 text-sm font-medium">{t('正在打开文件 AI 管理…')}</p>
              </div>
            </main>
          }
        >
          <FileManagementWorkspace
            onOpenSettings={() => setCurrentView('settings')}
            onWorkspaceChanged={value => {
              replaceWorkspace(value)
              void problemState.reload()
            }}
            workspace={workspace}
          />
        </Suspense>
      )
    }

    if (currentView === 'settings') {
      return (
        <Suspense
          fallback={
            <main className="grid h-full min-h-0 place-items-center">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
                <p className="mt-3 text-sm font-medium">{t('正在打开 AI 设置…')}</p>
              </div>
            </main>
          }
        >
          <AiProviderWorkspace />
        </Suspense>
      )
    }

    if (currentView === 'data') {
      return (
        <Suspense
          fallback={
            <main className="grid h-full min-h-0 place-items-center">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
                <p className="mt-3 text-sm font-medium">{t('正在打开数据管理…')}</p>
              </div>
            </main>
          }
        >
          <DataManagementWorkspace />
        </Suspense>
      )
    }

    if (isWorkspaceLoading) {
      return (
        <main className="grid min-h-0 place-items-center">
          <div className="text-center">
            <LoaderCircle aria-hidden="true" className="mx-auto size-6 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium">{t('正在读取本地工作区…')}</p>
          </div>
        </main>
      )
    }

    if (!workspace) {
      return (
        <WorkspaceOnboarding
          error={workspaceError}
          isBusy={isWorkspaceBusy}
          onChoose={request => void handleChooseWorkspace(request)}
        />
      )
    }

    if (!workspace.available) {
      return (
        <WorkspaceUnavailable
          isBusy={isWorkspaceBusy}
          onChoose={request => void handleChooseWorkspace(request)}
          workspace={workspace}
        />
      )
    }

    if (currentView === 'templates') {
      return (
        <TemplateLibrary
          isBusy={isWorkspaceBusy}
          isProblemBusy={problemState.isBusy}
          onAction={request => void handleTemplateAction(request)}
          onChangeWorkspace={() => void handleChooseWorkspace({ intent: 'open' })}
          onClearProblemError={problemState.clearError}
          onCreateTemplate={() => setCreateOpen(true)}
          onDeleteTemplate={handleDeleteTemplate}
          onOpenProblem={openProblem}
          onReloadSource={source.reload}
          onRescan={() => void handleRescan()}
          onSelectTemplate={templateId => {
            setRevealTemplateId(null)
            setSelectedTemplateId(templateId)
          }}
          onUpsertProblemRelation={async request =>
            Boolean(await problemState.upsertRelation(request))
          }
          problemError={problemState.error}
          problems={problemState.problems}
          revealTemplateId={revealTemplateId}
          selectedTemplate={selectedTemplate}
          selectedTemplateId={selectedTemplateId}
          sourceState={source.state}
          workspace={workspace}
        />
      )
    }

    if (currentView === 'problems') {
      return (
        <ProblemWorkspace
          error={problemState.error}
          isBusy={problemState.isBusy}
          isLoading={problemState.isLoading}
          onAddImages={problemState.addImages}
          onAnalysisCreated={problemState.acceptProblem}
          onClearError={problemState.clearError}
          onCreate={problemState.createProblem}
          onDelete={problemState.deleteProblem}
          onOpenTemplate={openTemplate}
          onRemoveImage={problemState.removeImage}
          onRemoveRelation={problemState.removeRelation}
          onSelect={setSelectedProblemId}
          onUpdate={problemState.updateProblem}
          onUpsertRelation={problemState.upsertRelation}
          problems={problemState.problems}
          selectedProblemId={selectedProblemId}
          templates={workspace.templates}
        />
      )
    }

    return (
      <Dashboard
        onCreateTemplate={() => setCreateOpen(true)}
        onOpenAi={() => setCurrentView('ai')}
        onOpenProblem={openProblem}
        onOpenProblems={() => setCurrentView('problems')}
        onOpenTemplate={openTemplate}
        onOpenTemplates={() => setCurrentView('templates')}
        pendingPlanCount={pendingPlanCount}
        problems={problemState.problems}
        workspace={workspace}
      />
    )
  }

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="app-shell grid h-screen min-h-[640px] grid-rows-[60px_minmax(0,1fr)_30px] overflow-hidden text-foreground">
        <header
          className={cn(
            'glass-toolbar window-drag relative flex items-center border-b pr-4',
            platform === 'darwin' ? 'pl-[86px]' : 'pl-4',
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="brand-mark grid size-8 shrink-0 place-items-center rounded-xl text-white ring-1 ring-white/15">
              <Boxes aria-hidden="true" className="size-4" strokeWidth={2} />
            </span>
            <span className="truncate text-[14px] font-semibold tracking-[-0.02em]">
              {t('算法学习工作台')}
            </span>
            <Badge className="hidden sm:inline-flex" tone="accent">
              V2 · {runtimeState.status === 'ready' ? runtimeState.value.appVersion : '…'}
            </Badge>
          </div>

          <div className="window-no-drag ml-auto flex items-center gap-2">
            <button
              aria-label={t('打开全局搜索')}
              className="glass-search hidden h-9 min-w-60 items-center gap-2 rounded-xl border px-3 text-xs text-muted-foreground shadow-xs outline-none transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:flex"
              onClick={() => setCommandOpen(true)}
              type="button"
            >
              <Search aria-hidden="true" className="size-3.5" />
              <span>{t('搜索模板或题目')}</span>
              <kbd className="ml-auto rounded-md border border-border bg-panel px-1.5 py-0.5 font-sans text-[9px] font-semibold shadow-xs">
                {shortcutLabel}
              </kbd>
            </button>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Button
                  aria-label={locale === 'en' ? t('切换到中文界面') : t('切换到英文界面')}
                  data-testid="locale-toggle"
                  onClick={toggleLocale}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Languages aria-hidden="true" className="size-4" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="z-50 rounded-md bg-foreground px-2 py-1 text-[11px] text-background shadow-md"
                  sideOffset={6}
                >
                  {t('切换语言')} · {locale === 'en' ? 'EN' : '中'}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Button
                  aria-label={t(theme === 'dark' ? '切换到浅色主题' : '切换到深色主题')}
                  onClick={toggleTheme}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  {theme === 'dark' ? (
                    <Sun aria-hidden="true" className="size-4" />
                  ) : (
                    <Moon aria-hidden="true" className="size-4" />
                  )}
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="z-50 rounded-md bg-foreground px-2 py-1 text-[11px] text-background shadow-md"
                  sideOffset={6}
                >
                  {t('切换主题')}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        </header>

        <div className="grid min-h-0 grid-cols-[224px_minmax(0,1fr)]">
          <aside className="glass-sidebar flex min-h-0 flex-col border-r px-3 py-4">
            <div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/75">
              {t('知识工作台')}
            </div>
            <nav aria-label={t('主导航')} className="space-y-1">
              {navigationItems.map(item => (
                <NavigationButton
                  active={item.id === currentView}
                  item={item}
                  key={item.label}
                  onSelect={setCurrentView}
                  shortcutLabel={item.shortcut ? `${shortcutPrefix}${item.shortcut}` : undefined}
                />
              ))}
            </nav>

            <Separator.Root className="my-4 h-px bg-border" decorative />

            <div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/75">
              {t('模型与服务')}
            </div>

            <button
              aria-current={currentView === 'settings' ? 'page' : undefined}
              aria-label={t('AI 设置')}
              className={cn(
                'relative flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring',
                currentView === 'settings'
                  ? 'bg-accent-blue/12 text-accent-blue shadow-xs ring-1 ring-accent-blue/12'
                  : 'text-muted-foreground hover:bg-panel hover:text-foreground',
              )}
              onClick={() => setCurrentView('settings')}
              type="button"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-accent-blue/10 text-accent-blue">
                <Settings2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
              </span>
              {t('AI 设置')}
              <kbd className="nav-shortcut ml-auto font-sans text-[9px] font-medium">
                {shortcutPrefix},
              </kbd>
            </button>

            <section
              aria-label={t('快捷操作')}
              className="quick-action-panel mt-4 rounded-2xl border p-2"
            >
              <div className="flex items-center gap-2 px-2 pb-1.5 pt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">
                <Command aria-hidden="true" className="size-3" />
                {t('快捷操作')}
              </div>
              <button
                aria-label={t('搜索知识库')}
                className="quick-action-row group"
                onClick={() => setCommandOpen(true)}
                type="button"
              >
                <Search aria-hidden="true" className="size-3.5 text-primary" />
                <span>{t('搜索知识库')}</span>
                <kbd className="ml-auto font-sans text-[9px] text-muted-foreground">
                  {shortcutLabel}
                </kbd>
              </button>
              <button
                aria-label={t('打开模板创建窗口')}
                className="quick-action-row group"
                disabled={!workspace?.available}
                onClick={() => setCreateOpen(true)}
                type="button"
              >
                <Plus aria-hidden="true" className="size-3.5 text-accent-cyan" />
                <span>{t('新建模板')}</span>
                <kbd className="ml-auto font-sans text-[9px] text-muted-foreground">
                  {createShortcutLabel}
                </kbd>
              </button>
            </section>

            <div className="glass-floating mt-auto overflow-hidden rounded-2xl border shadow-panel">
              <div className="border-b border-border bg-surface-subtle/70 px-3.5 py-2.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {t('当前工作区')}
              </div>
              <div className="px-3.5 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      workspace?.available ? 'bg-success' : 'bg-warning',
                    )}
                  />
                  <span className="truncate">{workspace?.name ?? t('尚未连接工作区')}</span>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                  {workspace
                    ? `${workspace.summary.templateCount} ${t('个模板')} · ${t('本地索引')}`
                    : t('创建或选择一个普通文件夹即可开始。')}
                </p>
              </div>
            </div>
          </aside>

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="relative h-full min-h-0 overflow-hidden"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            key={currentView}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <AnimatePresence>
              {(workspaceError || notice) && workspace && (
                <motion.div
                  animate={{ opacity: 1 }}
                  className="absolute left-1/2 top-3 z-40 w-max max-w-[min(640px,calc(100%-32px))] -translate-x-1/2"
                  exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                  initial={prefersReducedMotion ? false : { opacity: 0 }}
                >
                  <motion.div
                    animate={{ y: 0 }}
                    className={cn(
                      'glass-floating flex items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-panel',
                      workspaceError
                        ? 'border-red-500/25 text-red-700 dark:text-red-300'
                        : 'border-success/20 text-foreground',
                    )}
                    exit={prefersReducedMotion ? undefined : { y: -6 }}
                    initial={prefersReducedMotion ? false : { y: -8 }}
                    role={workspaceError ? 'alert' : 'status'}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {workspaceError ? (
                      <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
                    ) : (
                      <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
                    )}
                    <span>{t(workspaceError ?? notice ?? '')}</span>
                    <button
                      aria-label={t('关闭提示')}
                      className="ml-2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                      onClick={() => {
                        clearWorkspaceError()
                        setNotice(null)
                      }}
                      type="button"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {renderContent()}
          </motion.div>
        </div>

        <footer className="glass-toolbar flex items-center border-t px-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success" />
            {t('桌面运行时')}
          </span>
          <span className="ml-3 border-l border-border pl-3">
            {runtimeState.status === 'loading' && t('正在读取运行信息…')}
            {runtimeState.status === 'error' && t('运行信息暂不可用')}
            {runtimeState.status === 'ready' &&
              `Electron ${runtimeState.value.electronVersion} · ${runtimeState.value.platform}`}
          </span>
          <span className="ml-auto inline-flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-3" />
            {workspace
              ? `${workspace.summary.templateCount} ${t('个模板')} · ${problemState.problems.length} ${t('道题')}`
              : t('离线功能优先')}
          </span>
        </footer>
      </div>

      <CommandPalette
        onOpenChange={setCommandOpen}
        onSelectProblem={openProblem}
        onSelectTemplate={openTemplate}
        open={commandOpen}
        problems={problemState.problems}
        templates={workspace?.templates ?? []}
      />
      <CreateTemplateDialog
        error={workspaceError}
        isBusy={isWorkspaceBusy}
        onBatchComplete={result => {
          replaceWorkspace(result.workspace)
          setCurrentView('templates')
          setSelectedTemplateId(result.imported[0]?.templateId ?? null)
          setNotice(t('已批量导入 {count} 份 C++ 模板', { count: result.imported.length }))
        }}
        onCreate={handleCreateTemplate}
        onOpenChange={open => {
          setCreateOpen(open)
          if (!open) {
            clearWorkspaceError()
          }
        }}
        open={createOpen}
      />
    </Tooltip.Provider>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  )
}

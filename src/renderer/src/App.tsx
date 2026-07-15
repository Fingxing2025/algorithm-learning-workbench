import * as Separator from '@radix-ui/react-separator'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  Boxes,
  Check,
  CircleDot,
  FileCode2,
  FolderOpen,
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
import { motion, useReducedMotion } from 'motion/react'
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
import { AlgorithmCard } from '@/features/templates/algorithm-card'
import { CreateTemplateDialog } from '@/features/templates/create-template-dialog'
import { TemplateTree } from '@/features/templates/template-tree'
import { useTemplateSource } from '@/features/templates/use-template-source'
import { useWorkspace } from '@/features/templates/use-workspace'
import { WorkspaceOnboarding } from '@/features/templates/workspace-onboarding'
import { useRuntimeInfo } from '@/hooks/use-runtime-info'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'

const FileManagementWorkspace = lazy(async () => {
  const module = await import('@/features/ai/file-management-workspace')
  return { default: module.FileManagementWorkspace }
})

const AiProviderWorkspace = lazy(async () => {
  const module = await import('@/features/ai/ai-provider-workspace')
  return { default: module.AiProviderWorkspace }
})

type AppView = 'ai' | 'dashboard' | 'problems' | 'settings' | 'templates'

interface NavigationItem {
  disabled?: boolean
  icon: LucideIcon
  id?: AppView
  label: string
}

const navigationItems: NavigationItem[] = [
  { icon: LayoutDashboard, id: 'dashboard', label: '工作台' },
  { icon: FileCode2, id: 'templates', label: '模板库' },
  { icon: BookOpenText, id: 'problems', label: '题目' },
  { icon: Sparkles, id: 'ai', label: 'AI 管理' },
]

function NavigationButton({
  active,
  item,
  onSelect,
}: {
  active: boolean
  item: NavigationItem
  onSelect: (view: AppView) => void
}) {
  const Icon = item.icon
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-primary/11 text-primary shadow-xs',
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
          'absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary opacity-0 transition-opacity',
          active && 'opacity-100',
        )}
      />
      <Icon
        aria-hidden="true"
        className="size-4 transition-transform duration-150 group-hover:scale-105"
        strokeWidth={1.8}
      />
      <span>{item.label}</span>
      {item.disabled && <span className="ml-auto text-[10px] font-medium uppercase">稍后</span>}
    </button>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  note,
  tone,
  value,
}: {
  icon: LucideIcon
  label: string
  note: string
  tone: 'amber' | 'indigo' | 'teal'
  value: string
}) {
  const toneClasses = {
    amber: 'bg-warning/12 text-warning ring-warning/15',
    indigo: 'bg-primary/11 text-primary ring-primary/15',
    teal: 'bg-success/12 text-success ring-success/15',
  }

  return (
    <article className="interactive-lift rounded-2xl border border-border bg-panel p-4 shadow-panel hover:border-border-strong">
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
    </article>
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
  return (
    <main className="grid min-h-0 place-items-center overflow-y-auto p-8">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-panel p-7 text-center shadow-xs">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning/12 text-warning">
          <AlertTriangle aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">原工作区当前不可用</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          “{workspace.name}”可能已被移动、重命名或暂时卸载。应用没有修改其中的文件。
        </p>
        <Button
          className="mt-5"
          disabled={isBusy}
          onClick={() => onChoose({ intent: 'open' })}
          type="button"
        >
          <FolderOpen aria-hidden="true" className="size-4" />
          重新选择工作区
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
  const templateOverview = workspace.templates.slice(0, 5)
  const recentProblems = problems.slice(0, 5)

  return (
    <main className="relative min-h-0 overflow-y-auto px-5 py-5 lg:px-8 lg:py-7">
      <div
        aria-hidden="true"
        className="app-grid-texture pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60"
      />
      <div className="relative mx-auto max-w-[1120px]">
        <section className="relative overflow-hidden rounded-[22px] border border-primary/15 bg-panel px-5 py-5 shadow-focus lg:px-6">
          <div
            aria-hidden="true"
            className="absolute -right-16 -top-24 size-72 rounded-full bg-primary/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 right-1/3 size-56 rounded-full bg-success/8 blur-3xl"
          />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                <CircleDot aria-hidden="true" className="size-3.5 fill-success/15 text-success" />
                {workspace.name} · 本地工作区
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-[-0.035em] lg:text-[28px]">
                工作台
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                把算法源码、题目记录与 AI 整理集中在一个本地知识库中。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onOpenProblems} type="button" variant="outline">
                <BookOpenText aria-hidden="true" className="size-4" />
                浏览题目
              </Button>
              <Button onClick={onOpenTemplates} type="button" variant="outline">
                <FolderOpen aria-hidden="true" className="size-4" />
                浏览模板库
              </Button>
              <Button onClick={onCreateTemplate} type="button">
                <Plus aria-hidden="true" className="size-4" />
                新建模板
              </Button>
            </div>
          </div>
        </section>

        <section aria-label="知识库概览" className="mt-6 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            icon={FileCode2}
            label="算法模板"
            note="已索引的本地源码"
            tone="indigo"
            value={String(workspace.summary.templateCount)}
          />
          <SummaryCard
            icon={BookOpenText}
            label="题目卡片"
            note="沉淀题面与模板关联"
            tone="teal"
            value={String(problems.length)}
          />
          <SummaryCard
            icon={Sparkles}
            label="待确认计划"
            note={pendingPlanCount > 0 ? '需要你审查后才会执行' : '当前没有待处理变更'}
            tone="amber"
            value={String(pendingPlanCount)}
          />
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
          <section className="rounded-2xl border border-border bg-panel p-5 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">模板概览</h2>
                <p className="mt-1 text-xs text-muted-foreground">从当前索引快速打开模板</p>
              </div>
              <button
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onOpenTemplates}
                type="button"
              >
                查看全部
                <ArrowRight aria-hidden="true" className="size-3" />
              </button>
            </div>

            {templateOverview.length > 0 ? (
              <div className="mt-4 space-y-1.5">
                {templateOverview.map(template => (
                  <button
                    className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left outline-none transition-all hover:translate-x-0.5 hover:border-border hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring"
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
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid min-h-52 place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
                <div>
                  <FileCode2 aria-hidden="true" className="mx-auto size-7 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">从第一份模板开始</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    新建源码文件后，它会立即进入本地索引。
                  </p>
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-4">
            <section className="rounded-2xl border border-border bg-panel p-5 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">最近题目</h2>
                  <p className="mt-1 text-xs text-muted-foreground">继续整理题面和模板关联</p>
                </div>
                <button
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-success outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={onOpenProblems}
                  type="button"
                >
                  查看全部
                  <ArrowRight aria-hidden="true" className="size-3" />
                </button>
              </div>
              {recentProblems.length > 0 ? (
                <div className="mt-4 space-y-1.5">
                  {recentProblems.map(problem => (
                    <button
                      className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left outline-none transition-all hover:translate-x-0.5 hover:border-border hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring"
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
                            '本地题目卡片'}
                        </span>
                      </span>
                      <Badge>{problem.relations.length} 个模板</Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 grid min-h-40 place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
                  <div>
                    <BookOpenText className="mx-auto size-7 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">创建第一张题目卡片</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      无需 AI，也能手动记录题面并关联模板。
                    </p>
                    <Button className="mt-4" onClick={onOpenProblems} size="compact" type="button">
                      进入题目库
                    </Button>
                  </div>
                </div>
              )}
            </section>
            <section className="relative overflow-hidden rounded-2xl border border-warning/20 bg-warning/7 p-5 shadow-panel">
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
                    <h2 className="text-sm font-semibold">AI 整理中心</h2>
                    {pendingPlanCount > 0 && (
                      <Badge tone="warning">{pendingPlanCount} 项待审</Badge>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    {pendingPlanCount > 0
                      ? '有新的文件整理建议等待确认；执行前可逐项查看 Diff。'
                      : '扫描重复模板、命名异常和缺失元数据，AI 只会先生成可审查计划。'}
                  </p>
                  <Button
                    className="mt-3"
                    onClick={onOpenAi}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    打开 AI 管理
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
  onOpenProblem,
  onRescan,
  onSelectTemplate,
  onUpsertProblemRelation,
  problemError,
  problems,
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
  onOpenProblem: (problemId: string) => void
  onReloadSource: () => void
  onRescan: () => void
  onSelectTemplate: (templateId: string) => void
  onUpsertProblemRelation: (request: UpsertProblemRelationRequest) => Promise<boolean>
  problemError: string | null
  problems: Problem[]
  selectedTemplate: TemplateSummary | null
  selectedTemplateId: string | null
  sourceState: ReturnType<typeof useTemplateSource>['state']
  workspace: WorkspaceSnapshot
}) {
  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background/70">
      <header className="flex min-h-[62px] flex-wrap items-center gap-3 border-b border-border bg-panel/92 px-5 py-2.5 shadow-xs">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <FileCode2 aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">模板库</h1>
            <Badge tone="accent">{workspace.summary.templateCount} 个模板</Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            {workspace.name} · 本地索引
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
            更换目录
          </Button>
          <Button
            aria-label="重新扫描工作区"
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
            新建模板
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,310px)_minmax(0,1fr)]">
        <TemplateTree
          onAction={onAction}
          onSelect={onSelectTemplate}
          selectedTemplateId={selectedTemplateId}
          templates={workspace.templates}
        />
        <AlgorithmCard
          onAction={onAction}
          isProblemBusy={isProblemBusy}
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
      </div>
    </main>
  )
}

export default function App() {
  const [commandOpen, setCommandOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [currentView, setCurrentView] = useState<AppView>('dashboard')
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingPlanCount, setPendingPlanCount] = useState(0)
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const runtimeState = useRuntimeInfo()
  const { theme, toggleTheme } = useTheme()
  const problemState = useProblems()
  const {
    chooseWorkspace,
    clearError: clearWorkspaceError,
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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

  const handleChooseWorkspace = async (request: ChooseWorkspaceRequest) => {
    const value = await chooseWorkspace(request)
    if (value) {
      setCurrentView('templates')
      setSelectedTemplateId(null)
      setNotice(`已连接工作区“${value.name}”`)
    }
  }

  const handleRescan = async () => {
    const value = await rescan()
    if (value) {
      setNotice(`扫描完成：发现 ${value.summary.templateCount} 个模板`)
    }
  }

  const handleCreateTemplate = async (request: ImportTemplateRequest) => {
    const result = await importTemplate(request)
    if (!result) {
      return false
    }
    setCurrentView('templates')
    setSelectedTemplateId(result.templateId)
    setNotice(`已创建 ${request.relativePath}`)
    return true
  }

  const handleTemplateAction = async (request: TemplateActionRequest) => {
    const succeeded = await performTemplateAction(request)
    if (succeeded) {
      const messageByAction = {
        'copy-relative-path': '已复制相对路径',
        'copy-source': '已复制模板源码',
        reveal: '已在文件管理器中定位',
      }
      setNotice(messageByAction[request.action])
    }
  }

  const openTemplate = (templateId: string) => {
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
                <p className="mt-3 text-sm font-medium">正在打开文件 AI 管理…</p>
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
                <p className="mt-3 text-sm font-medium">正在打开 AI 设置…</p>
              </div>
            </main>
          }
        >
          <AiProviderWorkspace />
        </Suspense>
      )
    }

    if (isWorkspaceLoading) {
      return (
        <main className="grid min-h-0 place-items-center">
          <div className="text-center">
            <LoaderCircle aria-hidden="true" className="mx-auto size-6 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium">正在读取本地工作区…</p>
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
          onOpenProblem={openProblem}
          onReloadSource={source.reload}
          onRescan={() => void handleRescan()}
          onSelectTemplate={setSelectedTemplateId}
          onUpsertProblemRelation={async request =>
            Boolean(await problemState.upsertRelation(request))
          }
          problemError={problemState.error}
          problems={problemState.problems}
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
      <div className="grid h-screen min-h-[640px] grid-rows-[60px_minmax(0,1fr)_30px] overflow-hidden bg-background/92 text-foreground">
        <header
          className={cn(
            'window-drag relative flex items-center border-b border-border bg-panel/92 pr-4 shadow-xs backdrop-blur-xl',
            platform === 'darwin' ? 'pl-[86px]' : 'pl-4',
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_var(--primary)] ring-1 ring-white/15">
              <Boxes aria-hidden="true" className="size-4" strokeWidth={2} />
            </span>
            <span className="truncate text-[14px] font-semibold tracking-[-0.02em]">
              算法学习工作台
            </span>
            <Badge className="hidden sm:inline-flex" tone="accent">
              V2 · {runtimeState.status === 'ready' ? runtimeState.value.appVersion : '…'}
            </Badge>
          </div>

          <div className="window-no-drag ml-auto flex items-center gap-2">
            <button
              aria-label="打开全局搜索"
              className="hidden h-9 min-w-60 items-center gap-2 rounded-xl border border-border bg-surface-subtle/80 px-3 text-xs text-muted-foreground shadow-xs outline-none transition-all hover:border-border-strong hover:bg-panel focus-visible:ring-2 focus-visible:ring-ring md:flex"
              onClick={() => setCommandOpen(true)}
              type="button"
            >
              <Search aria-hidden="true" className="size-3.5" />
              <span>搜索模板或题目</span>
              <kbd className="ml-auto rounded-md border border-border bg-panel px-1.5 py-0.5 font-sans text-[9px] font-semibold shadow-xs">
                {shortcutLabel}
              </kbd>
            </button>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Button
                  aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
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
                  切换主题
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        </header>

        <div className="grid min-h-0 grid-cols-[224px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-border bg-sidebar/88 px-3 py-4">
            <div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/75">
              知识工作台
            </div>
            <nav aria-label="主导航" className="space-y-1">
              {navigationItems.map(item => (
                <NavigationButton
                  active={item.id === currentView}
                  item={item}
                  key={item.label}
                  onSelect={setCurrentView}
                />
              ))}
            </nav>

            <Separator.Root className="my-4 h-px bg-border" decorative />

            <div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/75">
              模型与服务
            </div>

            <button
              aria-current={currentView === 'settings' ? 'page' : undefined}
              className={cn(
                'relative flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring',
                currentView === 'settings'
                  ? 'bg-primary/11 text-primary shadow-xs'
                  : 'text-muted-foreground hover:bg-panel hover:text-foreground',
              )}
              onClick={() => setCurrentView('settings')}
              type="button"
            >
              <Settings2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
              AI 设置
            </button>

            <div className="mt-auto overflow-hidden rounded-2xl border border-border bg-panel shadow-panel">
              <div className="border-b border-border bg-surface-subtle/70 px-3.5 py-2.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                当前工作区
              </div>
              <div className="px-3.5 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      workspace?.available ? 'bg-success' : 'bg-warning',
                    )}
                  />
                  <span className="truncate">{workspace?.name ?? '尚未连接工作区'}</span>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                  {workspace
                    ? `${workspace.summary.templateCount} 个模板 · 本地索引`
                    : '创建或选择一个普通文件夹即可开始。'}
                </p>
              </div>
            </div>
          </aside>

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="relative h-full min-h-0 overflow-hidden"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            key={currentView}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {(workspaceError || notice) && workspace && (
              <div
                className={cn(
                  'absolute left-1/2 top-3 z-40 flex max-w-[min(640px,calc(100%-32px))] -translate-x-1/2 items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-lg',
                  workspaceError
                    ? 'border-red-500/25 bg-panel text-red-700 dark:text-red-300'
                    : 'border-success/20 bg-panel text-foreground',
                )}
                role={workspaceError ? 'alert' : 'status'}
              >
                {workspaceError ? (
                  <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
                )}
                <span>{workspaceError ?? notice}</span>
                <button
                  aria-label="关闭提示"
                  className="ml-2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    clearWorkspaceError()
                    setNotice(null)
                  }}
                  type="button"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </div>
            )}
            {renderContent()}
          </motion.div>
        </div>

        <footer className="flex items-center border-t border-border bg-panel/95 px-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success" />
            桌面运行时
          </span>
          <span className="ml-3 border-l border-border pl-3">
            {runtimeState.status === 'loading' && '正在读取运行信息…'}
            {runtimeState.status === 'error' && '运行信息暂不可用'}
            {runtimeState.status === 'ready' &&
              `Electron ${runtimeState.value.electronVersion} · ${runtimeState.value.platform}`}
          </span>
          <span className="ml-auto inline-flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-3" />
            {workspace
              ? `${workspace.summary.templateCount} 个模板 · ${problemState.problems.length} 道题`
              : '离线功能优先'}
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

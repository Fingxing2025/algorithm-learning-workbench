import * as Separator from '@radix-ui/react-separator'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  AlertTriangle,
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
import { useEffect, useMemo, useState } from 'react'

import type {
  ChooseWorkspaceRequest,
  TemplateActionRequest,
  TemplateSummary,
  WorkspaceSnapshot,
} from '@core/contracts/workspace'

import { CommandPalette } from '@/components/command-palette'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlgorithmCard } from '@/features/templates/algorithm-card'
import { CreateTemplateDialog } from '@/features/templates/create-template-dialog'
import { TemplateTree } from '@/features/templates/template-tree'
import { useTemplateSource } from '@/features/templates/use-template-source'
import { useWorkspace } from '@/features/templates/use-workspace'
import { WorkspaceOnboarding } from '@/features/templates/workspace-onboarding'
import { useRuntimeInfo } from '@/hooks/use-runtime-info'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'

type AppView = 'dashboard' | 'templates'

interface NavigationItem {
  disabled?: boolean
  icon: LucideIcon
  id?: AppView
  label: string
}

const navigationItems: NavigationItem[] = [
  { icon: LayoutDashboard, id: 'dashboard', label: '工作台' },
  { icon: FileCode2, id: 'templates', label: '模板库' },
  { disabled: true, icon: BookOpenText, label: '题目' },
  { disabled: true, icon: Sparkles, label: 'AI 管理' },
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
        'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-primary/10 text-primary',
        !active && !item.disabled && 'text-muted-foreground hover:bg-muted hover:text-foreground',
        item.disabled && 'cursor-not-allowed text-muted-foreground opacity-55',
      )}
      disabled={item.disabled}
      onClick={() => item.id && onSelect(item.id)}
      type="button"
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
      <span>{item.label}</span>
      {item.disabled && <span className="ml-auto text-[10px] font-medium uppercase">稍后</span>}
    </button>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <article className="rounded-xl border border-border bg-panel p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
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
  onOpenTemplate,
  onOpenTemplates,
  workspace,
}: {
  onCreateTemplate: () => void
  onOpenTemplate: (templateId: string) => void
  onOpenTemplates: () => void
  workspace: WorkspaceSnapshot
}) {
  const recentTemplates = workspace.templates.slice(0, 5)
  const scanWarnings = workspace.summary.issues.length + workspace.summary.caseConflictCount

  return (
    <main className="min-h-0 overflow-y-auto px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CircleDot aria-hidden="true" className="size-3.5 text-success" />
              {workspace.name} · 本地工作区
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">工作台</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              管理算法源码，并逐步建立模板与题目的联系。
            </p>
          </div>
          <div className="flex gap-2">
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

        <section aria-label="知识库概览" className="mt-6 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            icon={FileCode2}
            label="算法模板"
            value={String(workspace.summary.templateCount)}
          />
          <SummaryCard icon={BookOpenText} label="题目卡片" value="0" />
          <SummaryCard icon={Sparkles} label="待确认计划" value="0" />
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <section className="rounded-2xl border border-border bg-panel p-5 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">最近模板</h2>
                <p className="mt-1 text-xs text-muted-foreground">从当前索引快速继续工作</p>
              </div>
              <Badge>{recentTemplates.length} 项</Badge>
            </div>

            {recentTemplates.length > 0 ? (
              <div className="mt-4 space-y-1.5">
                {recentTemplates.map(template => (
                  <button
                    className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left outline-none transition-colors hover:border-border hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-ring"
                    key={template.id}
                    onClick={() => onOpenTemplate(template.id)}
                    type="button"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
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

          <section className="rounded-2xl border border-border bg-panel p-5 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">工作区状态</h2>
              <Badge tone={scanWarnings > 0 ? 'neutral' : 'success'}>
                {scanWarnings > 0 ? `${scanWarnings} 条提示` : '扫描正常'}
              </Badge>
            </div>
            <dl className="mt-5 space-y-4">
              <div>
                <dt className="text-[11px] text-muted-foreground">工作区名称</dt>
                <dd className="mt-1 truncate text-sm font-medium">{workspace.name}</dd>
              </div>
              <Separator.Root className="h-px bg-border" decorative />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11px] text-muted-foreground">已跳过链接</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {workspace.summary.skippedSymlinkCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">非源码文件</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {workspace.summary.unsupportedFileCount}
                  </dd>
                </div>
              </div>
            </dl>
            <div className="mt-5 rounded-xl border border-success/15 bg-success/7 p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-success">
                <ShieldCheck aria-hidden="true" className="size-4" />
                扫描不会修改源码
              </div>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                文件仍保留在你的普通目录中；SQLite 只保存可重建的索引。
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function TemplateLibrary({
  isBusy,
  onAction,
  onChangeWorkspace,
  onCreateTemplate,
  onRescan,
  onSelectTemplate,
  selectedTemplate,
  selectedTemplateId,
  sourceState,
  onReloadSource,
  workspace,
}: {
  isBusy: boolean
  onAction: (request: TemplateActionRequest) => void
  onChangeWorkspace: () => void
  onCreateTemplate: () => void
  onReloadSource: () => void
  onRescan: () => void
  onSelectTemplate: (templateId: string) => void
  selectedTemplate: TemplateSummary | null
  selectedTemplateId: string | null
  sourceState: ReturnType<typeof useTemplateSource>['state']
  workspace: WorkspaceSnapshot
}) {
  return (
    <main className="flex min-h-0 flex-col overflow-hidden">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-border bg-panel px-4 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold">模板库</h1>
            <Badge>{workspace.summary.templateCount} 个模板</Badge>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{workspace.name}</p>
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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(250px,320px)_minmax(0,1fr)]">
        <TemplateTree
          onAction={onAction}
          onSelect={onSelectTemplate}
          selectedTemplateId={selectedTemplateId}
          templates={workspace.templates}
        />
        <AlgorithmCard
          onAction={onAction}
          onReload={onReloadSource}
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const runtimeState = useRuntimeInfo()
  const { theme, toggleTheme } = useTheme()
  const {
    chooseWorkspace,
    clearError,
    createTemplate,
    error,
    isBusy,
    isLoading,
    performTemplateAction,
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

  const handleCreateTemplate = async (request: { content: string; fileName: string }) => {
    const result = await createTemplate(request)
    if (!result) {
      return false
    }
    setCurrentView('templates')
    setSelectedTemplateId(result.templateId)
    setNotice(`已创建 ${request.fileName}`)
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

  const renderContent = () => {
    if (isLoading) {
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
          error={error}
          isBusy={isBusy}
          onChoose={request => void handleChooseWorkspace(request)}
        />
      )
    }

    if (!workspace.available) {
      return (
        <WorkspaceUnavailable
          isBusy={isBusy}
          onChoose={request => void handleChooseWorkspace(request)}
          workspace={workspace}
        />
      )
    }

    if (currentView === 'templates') {
      return (
        <TemplateLibrary
          isBusy={isBusy}
          onAction={request => void handleTemplateAction(request)}
          onChangeWorkspace={() => void handleChooseWorkspace({ intent: 'open' })}
          onCreateTemplate={() => setCreateOpen(true)}
          onReloadSource={source.reload}
          onRescan={() => void handleRescan()}
          onSelectTemplate={setSelectedTemplateId}
          selectedTemplate={selectedTemplate}
          selectedTemplateId={selectedTemplateId}
          sourceState={source.state}
          workspace={workspace}
        />
      )
    }

    return (
      <Dashboard
        onCreateTemplate={() => setCreateOpen(true)}
        onOpenTemplate={openTemplate}
        onOpenTemplates={() => setCurrentView('templates')}
        workspace={workspace}
      />
    )
  }

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="grid h-screen min-h-[640px] grid-rows-[56px_minmax(0,1fr)_30px] overflow-hidden bg-background text-foreground">
        <header
          className={cn(
            'window-drag flex items-center border-b border-border bg-panel/95 pr-4',
            platform === 'darwin' ? 'pl-[86px]' : 'pl-4',
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Boxes aria-hidden="true" className="size-4" strokeWidth={2} />
            </span>
            <span className="truncate text-sm font-semibold tracking-tight">算法学习工作台</span>
            <Badge className="hidden sm:inline-flex" tone="accent">
              V2 · 阶段 1
            </Badge>
          </div>

          <div className="window-no-drag ml-auto flex items-center gap-2">
            <button
              aria-label="打开全局搜索"
              className="hidden h-8 min-w-52 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs text-muted-foreground shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:flex"
              onClick={() => setCommandOpen(true)}
              type="button"
            >
              <Search aria-hidden="true" className="size-3.5" />
              <span>搜索算法模板</span>
              <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px]">
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

        <div className="grid min-h-0 grid-cols-[210px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-border bg-sidebar p-3">
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

            <Separator.Root className="my-3 h-px bg-border" decorative />

            <button
              className="flex h-9 w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-muted-foreground opacity-55"
              disabled
              type="button"
            >
              <Settings2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
              设置
              <span className="ml-auto text-[10px] uppercase">稍后</span>
            </button>

            <div className="mt-auto rounded-xl border border-border bg-panel p-3 shadow-xs">
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
          </aside>

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="relative min-h-0 overflow-hidden"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {(error || notice) && workspace && (
              <div
                className={cn(
                  'absolute left-1/2 top-3 z-40 flex max-w-[min(640px,calc(100%-32px))] -translate-x-1/2 items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-lg',
                  error
                    ? 'border-red-500/25 bg-panel text-red-700 dark:text-red-300'
                    : 'border-success/20 bg-panel text-foreground',
                )}
                role={error ? 'alert' : 'status'}
              >
                {error ? (
                  <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
                )}
                <span>{error ?? notice}</span>
                <button
                  aria-label="关闭提示"
                  className="ml-2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    clearError()
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

        <footer className="flex items-center border-t border-border bg-panel px-3 text-[10px] text-muted-foreground">
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
            {workspace ? `${workspace.summary.templateCount} 个本地模板` : '离线功能优先'}
          </span>
        </footer>
      </div>

      <CommandPalette
        onOpenChange={setCommandOpen}
        onSelectTemplate={openTemplate}
        open={commandOpen}
        templates={workspace?.templates ?? []}
      />
      <CreateTemplateDialog
        error={error}
        isBusy={isBusy}
        onCreate={handleCreateTemplate}
        onOpenChange={open => {
          setCreateOpen(open)
          if (!open) {
            clearError()
          }
        }}
        open={createOpen}
      />
    </Tooltip.Provider>
  )
}

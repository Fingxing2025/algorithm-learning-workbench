import * as Separator from '@radix-ui/react-separator'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  AlertTriangle,
  Boxes,
  BookOpenText,
  FileCode2,
  Sparkles,
  type LucideIcon,
  Check,
  Command,
  Languages,
  LayoutDashboard,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import type { AppLocale } from '@/lib/i18n'
import type { WorkspaceSnapshot } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LiveRegion } from '@/components/live-region'
import { ResizableLayout } from '@/components/resizable-layout'
import { layoutPreferenceKeys, resetLayoutPreferences } from '@/hooks/use-layout-preference'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { RuntimeState } from '@/hooks/use-runtime-info'
import type { AppView } from '@/app/app-navigation'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
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
  { icon: ShieldCheck, id: 'data', label: '备份与恢复', shortcut: '5', tone: 'indigo' },
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
      <span className="navigation-label">{t(item.label)}</span>
      {item.disabled && (
        <span className="ml-auto text-[10px] font-medium uppercase">{t('稍后')}</span>
      )}
      {!item.disabled && shortcutLabel && (
        <kbd className="nav-shortcut ml-auto font-sans text-[9px] font-medium">{shortcutLabel}</kbd>
      )}
    </button>
  )
}

interface AppShellProps {
  children: ReactNode
  currentView: AppView
  locale: AppLocale
  notice: string | null
  onClearNotice: () => void
  onClearWorkspaceError: () => void
  onLayoutReset: () => void
  onNavigate: (view: AppView) => void
  onOpenCommand: () => void
  onOpenCreate: () => void
  onToggleLocale: () => void
  onToggleTheme: () => void
  overlays: ReactNode
  pageAnnouncement: string | null
  problemTotalCount: number
  runtimeState: RuntimeState
  theme: 'dark' | 'light'
  workspace: WorkspaceSnapshot | null
  workspaceError: string | null
}

export function AppShell({
  children,
  currentView,
  locale,
  notice,
  onClearNotice,
  onClearWorkspaceError,
  onLayoutReset,
  onNavigate,
  onOpenCommand,
  onOpenCreate,
  onToggleLocale,
  onToggleTheme,
  overlays,
  pageAnnouncement,
  problemTotalCount,
  runtimeState,
  theme,
  workspace,
  workspaceError,
}: AppShellProps) {
  const { t } = useI18n()
  const prefersReducedMotion = useReducedMotion()
  const compactNavigation = useMediaQuery('(max-width: 820px)')
  const platform = runtimeState.status === 'ready' ? runtimeState.value.platform : undefined
  const shortcutLabel = platform === 'darwin' ? '⌘K' : 'Ctrl K'
  const shortcutPrefix = platform === 'darwin' ? '⌘' : 'Ctrl '
  const createShortcutLabel = platform === 'darwin' ? '⌘⇧N' : 'Ctrl Shift N'

  return (
    <Tooltip.Provider delayDuration={300}>
      <LiveRegion message={pageAnnouncement} testId="page-announcement" />
      <div
        className="app-shell grid h-screen grid-rows-[60px_minmax(0,1fr)_30px] overflow-hidden text-foreground"
        data-compact-navigation={compactNavigation ? 'true' : 'false'}
      >
        <header
          className={cn(
            'app-header glass-toolbar window-drag relative flex items-center border-b pr-4',
            platform === 'darwin' ? 'pl-[86px]' : 'pl-4',
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="brand-mark grid size-8 shrink-0 place-items-center rounded-xl text-white ring-1 ring-white/15">
              <Boxes aria-hidden="true" className="size-4" strokeWidth={2} />
            </span>
            <span className="app-title truncate text-[14px] font-semibold tracking-[-0.02em]">
              {t('算法学习工作台')}
            </span>
            <Badge className="app-version hidden sm:inline-flex" tone="accent">
              V2 · {runtimeState.status === 'ready' ? runtimeState.value.appVersion : '…'}
            </Badge>
          </div>

          <div className="window-no-drag ml-auto flex items-center gap-2">
            <button
              aria-label={t('打开全局搜索')}
              className="glass-search hidden h-9 min-w-60 items-center gap-2 rounded-xl border px-3 text-xs text-muted-foreground shadow-xs outline-none transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:flex"
              onClick={onOpenCommand}
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
                  onClick={onToggleLocale}
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
                  onClick={onToggleTheme}
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

        <ResizableLayout
          className="min-h-0"
          compactPrimarySize={72}
          defaultPrimarySize={216}
          maximumPrimarySize={296}
          minimumPrimarySize={184}
          minimumSecondarySize={640}
          forceCompact={compactNavigation}
          primaryLabel={t('应用导航面板')}
          secondaryLabel={t('当前工作区页面')}
          separatorLabel={t('调整导航宽度')}
          storageKey={layoutPreferenceKeys.appNavigation}
          valueText={size => t('导航宽度 {size} 像素', { size })}
        >
          <aside
            className={cn(
              'glass-sidebar flex h-full min-h-0 flex-col px-3 py-4',
              compactNavigation && 'compact-navigation',
            )}
          >
            <div className="sidebar-section-label mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/75">
              {t('知识工作台')}
            </div>
            <nav aria-label={t('主导航')} className="space-y-1">
              {navigationItems.map(item => (
                <NavigationButton
                  active={item.id === currentView}
                  item={item}
                  key={item.label}
                  onSelect={onNavigate}
                  shortcutLabel={item.shortcut ? `${shortcutPrefix}${item.shortcut}` : undefined}
                />
              ))}
            </nav>

            <Separator.Root className="sidebar-separator my-4 h-px bg-border" decorative />

            <div className="sidebar-section-label mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/75">
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
              onClick={() => onNavigate('settings')}
              type="button"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-blue/10 text-accent-blue">
                <Settings2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
              </span>
              <span className="navigation-label">{t('AI 设置')}</span>
              <kbd className="nav-shortcut ml-auto font-sans text-[9px] font-medium">
                {shortcutPrefix},
              </kbd>
            </button>

            <section
              aria-label={t('快捷操作')}
              className="quick-action-panel mt-4 rounded-2xl border p-2"
            >
              <div className="quick-action-heading flex items-center gap-2 px-2 pb-1.5 pt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">
                <Command aria-hidden="true" className="size-3" />
                {t('快捷操作')}
              </div>
              <button
                aria-label={t('搜索知识库')}
                className="quick-action-row group"
                onClick={onOpenCommand}
                type="button"
              >
                <Search aria-hidden="true" className="size-3.5 text-primary" />
                <span className="quick-action-label">{t('搜索知识库')}</span>
                <kbd className="ml-auto font-sans text-[9px] text-muted-foreground">
                  {shortcutLabel}
                </kbd>
              </button>
              <button
                aria-label={t('打开模板创建窗口')}
                className="quick-action-row group"
                disabled={!workspace?.available}
                onClick={onOpenCreate}
                type="button"
              >
                <Plus aria-hidden="true" className="size-3.5 text-accent-cyan" />
                <span className="quick-action-label">{t('新建模板')}</span>
                <kbd className="ml-auto font-sans text-[9px] text-muted-foreground">
                  {createShortcutLabel}
                </kbd>
              </button>
              <button
                aria-label={t('重置布局')}
                className="quick-action-row group"
                onClick={() => {
                  resetLayoutPreferences()
                  onLayoutReset()
                }}
                type="button"
              >
                <RotateCcw aria-hidden="true" className="size-3.5 text-primary" />
                <span className="quick-action-label">{t('重置布局')}</span>
              </button>
            </section>

            <div className="workspace-status-card glass-floating mt-auto overflow-hidden rounded-2xl border shadow-panel">
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
                  className="workspace-notice-container absolute left-1/2 top-3 z-40 w-max max-w-[min(640px,calc(100%-32px))] -translate-x-1/2"
                  exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                  initial={prefersReducedMotion ? false : { opacity: 0 }}
                >
                  <motion.div
                    animate={{ y: 0 }}
                    aria-atomic="true"
                    aria-live={workspaceError ? 'assertive' : 'polite'}
                    className={cn(
                      'workspace-notice glass-floating flex items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-panel',
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
                        onClearWorkspaceError()
                        onClearNotice()
                      }}
                      type="button"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {children}
          </motion.div>
        </ResizableLayout>

        <footer className="app-footer glass-toolbar flex items-center border-t px-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success" />
            {t('桌面运行时')}
          </span>
          <span className="runtime-details ml-3 border-l border-border pl-3">
            {runtimeState.status === 'loading' && t('正在读取运行信息…')}
            {runtimeState.status === 'error' && t('运行信息暂不可用')}
            {runtimeState.status === 'ready' &&
              `Electron ${runtimeState.value.electronVersion} · ${runtimeState.value.platform}`}
          </span>
          <span className="workspace-counts ml-auto inline-flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-3" />
            {workspace
              ? `${workspace.summary.templateCount} ${t('个模板')} · ${problemTotalCount} ${t('道题')}`
              : t('离线功能优先')}
          </span>
        </footer>
      </div>

      {overlays}
    </Tooltip.Provider>
  )
}

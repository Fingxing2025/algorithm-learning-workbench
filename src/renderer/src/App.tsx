import * as Separator from '@radix-ui/react-separator'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  BookOpenText,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  CircleDot,
  Command,
  FileCode2,
  FolderPlus,
  LayoutDashboard,
  Moon,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import { CommandPalette } from '@/components/command-palette'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRuntimeInfo } from '@/hooks/use-runtime-info'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'

interface NavigationItem {
  active?: boolean
  icon: LucideIcon
  label: string
}

const navigationItems: NavigationItem[] = [
  { active: true, icon: LayoutDashboard, label: '工作台' },
  { icon: FileCode2, label: '模板库' },
  { icon: BookOpenText, label: '题目' },
  { icon: Sparkles, label: 'AI 管理' },
]

const summaryItems = [
  { icon: FileCode2, label: '算法模板', value: '0' },
  { icon: BookOpenText, label: '题目卡片', value: '0' },
  { icon: Bot, label: '待确认计划', value: '0' },
]

function NavigationButton({ active = false, icon: Icon, label }: NavigationItem) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary/10 text-primary'
          : 'cursor-not-allowed text-muted-foreground opacity-65',
      )}
      disabled={!active}
      type="button"
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
      <span>{label}</span>
      {!active && <span className="ml-auto text-[10px] font-medium uppercase">稍后</span>}
    </button>
  )
}

function SummaryCard({ icon: Icon, label, value }: (typeof summaryItems)[number]) {
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

export default function App() {
  const [commandOpen, setCommandOpen] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const runtimeState = useRuntimeInfo()
  const { theme, toggleTheme } = useTheme()

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

  const platform = runtimeState.status === 'ready' ? runtimeState.value.platform : undefined

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="grid h-screen min-h-[680px] grid-rows-[56px_minmax(0,1fr)_30px] overflow-hidden bg-background text-foreground">
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
              V2 · 阶段 0
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
              <span>搜索模板、题目或操作</span>
              <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px]">
                ⌘K
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

        <div className="grid min-h-0 grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_300px]">
          <aside className="flex min-h-0 flex-col border-r border-border bg-sidebar p-3">
            <nav aria-label="主导航" className="space-y-1">
              {navigationItems.map(item => (
                <NavigationButton key={item.label} {...item} />
              ))}
            </nav>

            <Separator.Root className="my-3 h-px bg-border" decorative />

            <button
              className="flex h-9 w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-muted-foreground opacity-65"
              disabled
              type="button"
            >
              <Settings2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
              设置
              <span className="ml-auto text-[10px] uppercase">稍后</span>
            </button>

            <div className="mt-auto rounded-xl border border-border bg-panel p-3 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <span className="size-2 rounded-full bg-warning" />
                尚未连接工作区
              </div>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                阶段 1 将支持创建空白目录或选择已有模板目录。
              </p>
            </div>
          </aside>

          <motion.main
            animate={{ opacity: 1, y: 0 }}
            className="min-h-0 overflow-y-auto px-6 py-6 lg:px-8"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            <div className="mx-auto max-w-5xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <CircleDot aria-hidden="true" className="size-3.5 text-success" />
                    本地优先 · 桌面端
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight">工作台</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    从空白工作区开始，逐步沉淀模板、题目和它们之间的联系。
                  </p>
                </div>
                <Button disabled type="button">
                  <FolderPlus aria-hidden="true" className="size-4" />
                  创建模板工作区
                </Button>
              </div>

              <section aria-label="知识库概览" className="mt-6 grid gap-3 sm:grid-cols-3">
                {summaryItems.map(item => (
                  <SummaryCard key={item.label} {...item} />
                ))}
              </section>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
                <section className="rounded-2xl border border-border bg-panel p-5 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">准备你的第一个工作区</h2>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        工程基线已完成，数据功能将在后续纵向切片接入。
                      </p>
                    </div>
                    <Badge tone="success">工程就绪</Badge>
                  </div>

                  <ol className="mt-5 space-y-3">
                    {[
                      ['01', '创建或选择模板目录', '只读扫描已有目录，不会自动移动文件'],
                      ['02', '添加第一份算法模板', '支持粘贴代码、上传文件与手动入库'],
                      ['03', '建立第一张题目卡片', '通过手动选择或 AI 草稿关联模板'],
                    ].map(([index, title, description], itemIndex) => (
                      <li
                        className="flex items-center gap-3 rounded-xl border border-border bg-background/70 p-3.5"
                        key={index}
                      >
                        <span
                          className={cn(
                            'grid size-8 shrink-0 place-items-center rounded-lg text-xs font-semibold',
                            itemIndex === 0
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {index}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{title}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {description}
                          </p>
                        </div>
                        <ChevronRight
                          aria-hidden="true"
                          className="ml-auto size-4 shrink-0 text-muted-foreground"
                        />
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="rounded-2xl border border-border bg-panel p-5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">最近模板</h2>
                    <Badge>0 项</Badge>
                  </div>
                  <div className="mt-5 grid min-h-52 place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
                    <div>
                      <span className="mx-auto grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                        <FileCode2 aria-hidden="true" className="size-5" strokeWidth={1.7} />
                      </span>
                      <p className="mt-3 text-sm font-medium">还没有模板</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        连接工作区后，最近访问的模板会显示在这里。
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </motion.main>

          <aside className="hidden min-h-0 border-l border-border bg-panel p-5 xl:block">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">运行状态</h2>
              <Badge tone="success">正常</Badge>
            </div>

            <div className="mt-5 space-y-3">
              {[
                ['进程隔离', 'Renderer 无 Node 权限'],
                ['本地数据', '尚未创建数据库'],
                ['AI Provider', '未配置'],
              ].map(([label, description]) => (
                <div className="flex gap-3" key={label}>
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-success/10 text-success">
                    <Check aria-hidden="true" className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold">{label}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <Separator.Root className="my-5 h-px bg-border" decorative />

            <div className="rounded-xl border border-primary/15 bg-primary/7 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <ShieldCheck aria-hidden="true" className="size-4" />
                安全边界已启用
              </div>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                文件、数据库、密钥和网络请求将只通过受校验的 Preload API 进入主进程。
              </p>
            </div>

            <button
              className="mt-4 flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setCommandOpen(true)}
              type="button"
            >
              <span className="inline-flex items-center gap-2">
                <Command aria-hidden="true" className="size-3.5" />
                试用全局搜索
              </span>
              <span>⌘K</span>
            </button>
          </aside>
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
          <span className="ml-auto">离线功能优先</span>
        </footer>
      </div>

      <CommandPalette onOpenChange={setCommandOpen} open={commandOpen} />
    </Tooltip.Provider>
  )
}

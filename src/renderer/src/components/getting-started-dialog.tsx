import * as Dialog from '@radix-ui/react-dialog'
import {
  BookOpenText,
  FileCode2,
  FolderOpen,
  HardDriveDownload,
  Link2,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { restoreFocusAfterDialog } from '@/lib/focus-management'
import { useI18n } from '@/lib/i18n'

interface GuideStep {
  description: string
  icon: LucideIcon
  title: string
  tone: string
}

const guideSteps: GuideStep[] = [
  {
    description:
      '先创建空白工作区，或选择一个已有模板目录并确认升级。未连接时，知识工作台页面会始终引导你连接工作区。',
    icon: FolderOpen,
    title: '连接模板工作区',
    tone: 'bg-primary/11 text-primary',
  },
  {
    description:
      '在模板库新建、上传或批量导入源码。外部源文件保持只读，入库内容保存到当前工作区的 templates/。',
    icon: FileCode2,
    title: '模板入库与模板库',
    tone: 'bg-accent-cyan/11 text-accent-cyan',
  },
  {
    description:
      '在题目页记录题面、图片、状态与备注，并把一道题关联到一个或多个算法模板。解除关系不会删除题目或模板。',
    icon: Link2,
    title: '题目卡片与模板关联',
    tone: 'bg-accent-coral/11 text-accent-coral',
  },
  {
    description:
      '不配置 Provider 也能浏览模板、管理题目和手动关联。需要 AI 时，再到 AI 设置中添加 Provider、模型和任务路由。',
    icon: Sparkles,
    title: 'AI 设置是可选项',
    tone: 'bg-warning/12 text-warning',
  },
  {
    description:
      'AI 只能生成可审查的整理计划。移动、覆盖、删除和元数据更新都要经过 Diff、用户确认、执行前备份、冲突复检和失败回滚。',
    icon: ShieldCheck,
    title: 'AI 文件管理必须先预览',
    tone: 'bg-success/11 text-success',
  },
  {
    description:
      '便携备份会深拷贝当前工作区；恢复也只原地替换当时连接的当前工作区，不会选择父目录、创建新工作区或导入 Provider。',
    icon: HardDriveDownload,
    title: '备份恢复只作用当前工作区',
    tone: 'bg-accent-blue/11 text-accent-blue',
  },
  {
    description:
      '模板、题目、关系、图片和撤销数据属于工作区。API Key 由操作系统安全存储保护，不进入工作区备份，也不会暴露给页面。',
    icon: BookOpenText,
    title: '本地优先与安全边界',
    tone: 'bg-primary/11 text-primary',
  },
]

export function GettingStartedDialog({
  onOpenChange,
  open,
  returnFocusTo,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  returnFocusTo?: HTMLElement | null
}) {
  const { t } = useI18n()

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[80] bg-overlay/70 backdrop-blur-[4px]" />
        <Dialog.Content
          className="dialog-surface fixed left-1/2 top-1/2 z-[81] flex max-h-[min(780px,calc(100vh-32px))] w-[min(820px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-primary/20 bg-panel shadow-2xl outline-none ring-1 ring-white/8"
          onCloseAutoFocus={event => restoreFocusAfterDialog(event, returnFocusTo)}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/11 text-primary">
              <BookOpenText aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-primary">
                {t('首次使用指南')}
              </p>
              <Dialog.Title className="mt-0.5 text-base font-semibold tracking-[-0.02em]">
                {t('使用说明')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('用几分钟了解工作区、知识整理、AI 与备份的安全边界。')}
              </Dialog.Description>
            </div>
            <Button
              aria-label={t('关闭使用说明')}
              className="ml-auto"
              onClick={() => onOpenChange(false)}
              size="close"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
            <ol className="grid gap-3 sm:grid-cols-2">
              {guideSteps.map((step, index) => {
                const Icon = step.icon
                return (
                  <li
                    className="rounded-2xl border border-border bg-background/58 p-4 shadow-xs"
                    key={step.title}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={`grid size-9 shrink-0 place-items-center rounded-xl ${step.tone}`}
                      >
                        <Icon className="size-4" strokeWidth={1.9} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                          {String(index + 1).padStart(2, '0')}
                        </p>
                        <h2 className="mt-0.5 text-[13px] font-semibold text-foreground">
                          {t(step.title)}
                        </h2>
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                      {t(step.description)}
                    </p>
                  </li>
                )
              })}
            </ol>
          </div>

          <footer className="flex shrink-0 flex-col gap-3 border-t border-border bg-surface-subtle/70 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <p className="text-[11px] leading-5 text-muted-foreground">
              {t('以后可随时从左侧“快捷操作”中的“使用说明”重新打开。')}
            </p>
            <Button
              className="sm:ml-auto"
              data-testid="getting-started-dismiss"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              {t('开始使用')}
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

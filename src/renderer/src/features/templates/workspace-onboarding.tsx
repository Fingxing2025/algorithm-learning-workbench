import { FolderOpen, FolderPlus, HardDrive, ShieldCheck } from 'lucide-react'

import type { ChooseWorkspaceRequest } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

interface WorkspaceOnboardingProps {
  error: string | null
  isBusy: boolean
  onChoose: (request: ChooseWorkspaceRequest) => void
}

export function WorkspaceOnboarding({ error, isBusy, onChoose }: WorkspaceOnboardingProps) {
  const { t } = useI18n()
  return (
    <main className="relative h-full min-h-0 overflow-y-auto px-6 py-7 lg:px-10 lg:py-9">
      <div
        aria-hidden="true"
        className="app-grid-texture pointer-events-none absolute inset-x-0 top-0 h-80 opacity-60"
      />
      <div className="relative mx-auto max-w-4xl">
        <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-panel px-6 py-6 shadow-focus">
          <div
            aria-hidden="true"
            className="absolute -right-16 -top-24 size-72 rounded-full bg-primary/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 right-1/3 size-56 rounded-full bg-success/8 blur-3xl"
          />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <Badge tone="accent">{t('首次设置 · 约 1 分钟')}</Badge>
              <h1 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">
                {t('连接你的模板工作区')}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t(
                  '工作区是你自己的普通文件夹。模板源码始终保留在文件系统中，应用只建立本地索引。',
                )}
              </p>
            </div>
            <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-primary/11 text-primary ring-1 ring-primary/12 sm:grid">
              <HardDrive aria-hidden="true" className="size-6" />
            </span>
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {t(error)}
          </div>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <section className="interactive-lift flex min-h-60 flex-col rounded-2xl border border-primary/18 bg-panel p-6 shadow-panel hover:border-primary/30">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <FolderPlus aria-hidden="true" className="size-5" />
              </span>
              <Badge tone="accent">{t('推荐新用户')}</Badge>
            </div>
            <h2 className="mt-5 text-base font-semibold">{t('创建空白工作区')}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t('通过对话框创建一个空白目录，并从第一份模板开始。')}
            </p>
            <Button
              className="mt-auto"
              disabled={isBusy}
              onClick={() => onChoose({ intent: 'create' })}
              type="button"
            >
              {t('创建工作区')}
            </Button>
          </section>

          <section className="interactive-lift flex min-h-60 flex-col rounded-2xl border border-border bg-panel p-6 shadow-panel hover:border-success/25">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-success/10 text-success ring-1 ring-success/10">
                <FolderOpen aria-hidden="true" className="size-5" />
              </span>
              <Badge tone="success">{t('只读扫描')}</Badge>
            </div>
            <h2 className="mt-5 text-base font-semibold">{t('选择已有模板目录')}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t('选择一个已有模板目录，先只读扫描，不会自动改名或移动文件。')}
            </p>
            <Button
              className="mt-auto"
              disabled={isBusy}
              onClick={() => onChoose({ intent: 'open' })}
              type="button"
              variant="outline"
            >
              {t('选择目录')}
            </Button>
          </section>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-success/15 bg-success/6 px-4 py-3.5 shadow-xs">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-success/11 text-success">
            <ShieldCheck aria-hidden="true" className="size-4" />
          </span>
          <div>
            <p className="text-xs font-semibold">{t('你的源码仍属于你')}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t(
                '目录授权和文件访问只发生在 Electron Main 进程。Renderer 不会获得文件系统或原始 IPC 权限。',
              )}
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

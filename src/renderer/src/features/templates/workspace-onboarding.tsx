import { FolderOpen, FolderPlus, HardDrive, ShieldCheck } from 'lucide-react'

import type { ChooseWorkspaceRequest } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface WorkspaceOnboardingProps {
  error: string | null
  isBusy: boolean
  onChoose: (request: ChooseWorkspaceRequest) => void
}

export function WorkspaceOnboarding({ error, isBusy, onChoose }: WorkspaceOnboardingProps) {
  return (
    <main className="min-h-0 overflow-y-auto px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone="accent">首次设置</Badge>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">连接你的模板工作区</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              工作区是你自己的普通文件夹。模板源码始终保留在文件系统中，应用只建立本地索引。
            </p>
          </div>
          <span className="hidden size-12 place-items-center rounded-2xl bg-primary/10 text-primary sm:grid">
            <HardDrive aria-hidden="true" className="size-6" />
          </span>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          <section className="flex min-h-60 flex-col rounded-2xl border border-border bg-panel p-6 shadow-xs">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <FolderPlus aria-hidden="true" className="size-5" />
            </span>
            <h2 className="mt-5 text-base font-semibold">创建空白工作区</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              在系统对话框中新建或选择空白文件夹，然后从第一份算法模板开始。
            </p>
            <Button
              className="mt-auto"
              disabled={isBusy}
              onClick={() => onChoose({ intent: 'create' })}
              type="button"
            >
              创建工作区
            </Button>
          </section>

          <section className="flex min-h-60 flex-col rounded-2xl border border-border bg-panel p-6 shadow-xs">
            <span className="grid size-10 place-items-center rounded-xl bg-muted text-foreground">
              <FolderOpen aria-hidden="true" className="size-5" />
            </span>
            <h2 className="mt-5 text-base font-semibold">选择已有模板目录</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              扫描常见源码文件并生成摘要；不会自动移动、改名、覆盖或删除任何内容。
            </p>
            <Button
              className="mt-auto"
              disabled={isBusy}
              onClick={() => onChoose({ intent: 'open' })}
              type="button"
              variant="outline"
            >
              选择目录
            </Button>
          </section>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/35 px-4 py-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          <p className="text-xs leading-5 text-muted-foreground">
            目录授权和文件访问只发生在 Electron Main 进程。Renderer 不会获得文件系统或原始 IPC
            权限。
          </p>
        </div>
      </div>
    </main>
  )
}

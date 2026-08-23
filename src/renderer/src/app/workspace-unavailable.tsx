import { AlertTriangle, FolderOpen } from 'lucide-react'

import type { ChooseWorkspaceRequest, WorkspaceSnapshot } from '@core/contracts/workspace'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

export function WorkspaceUnavailable({
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

import { useEffect, useState } from 'react'

import type { WorkspaceSnapshot } from '@core/contracts/workspace'

import { cn } from '@/lib/utils'

import { AiProviderWorkspace } from './ai-provider-workspace'
import { FileManagementWorkspace } from './file-management-workspace'

export function AiWorkspace({
  initialTab,
  onWorkspaceChanged,
  workspace,
}: {
  initialTab: 'files' | 'providers'
  onWorkspaceChanged: (workspace: WorkspaceSnapshot) => void
  workspace: WorkspaceSnapshot | null
}) {
  const [tab, setTab] = useState(initialTab)
  useEffect(() => setTab(initialTab), [initialTab])
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-end gap-1 border-b border-border bg-sidebar px-4">
        {(
          [
            ['files', '文件 AI 管理'],
            ['providers', 'Provider 配置'],
          ] as const
        ).map(([value, label]) => (
          <button
            className={cn(
              'h-9 border-b-2 px-3 text-xs font-medium outline-none',
              tab === value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'files' ? (
          <FileManagementWorkspace onWorkspaceChanged={onWorkspaceChanged} workspace={workspace} />
        ) : (
          <AiProviderWorkspace />
        )}
      </div>
    </div>
  )
}

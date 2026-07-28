import { useEffect } from 'react'

export type AppView = 'ai' | 'dashboard' | 'data' | 'problems' | 'settings' | 'templates'

export const appViewLabels: Record<AppView, string> = {
  ai: 'AI 管理',
  dashboard: '工作台',
  data: '备份与恢复',
  problems: '题目',
  settings: 'AI 设置',
  templates: '模板库',
}

type AppShortcutAction =
  { type: 'navigate'; view: AppView } | { type: 'open-command' } | { type: 'open-create' }

interface ResolveAppShortcutOptions {
  altKey: boolean
  hasPrimaryModifier: boolean
  isEditing: boolean
  key: string
  shiftKey: boolean
  workspaceAvailable: boolean
}

export function resolveAppShortcut({
  altKey,
  hasPrimaryModifier,
  isEditing,
  key,
  shiftKey,
  workspaceAvailable,
}: ResolveAppShortcutOptions): AppShortcutAction | null {
  const normalizedKey = key.toLowerCase()
  if (hasPrimaryModifier && normalizedKey === 'k') return { type: 'open-command' }
  if (!hasPrimaryModifier || altKey || isEditing) return null
  if (shiftKey && normalizedKey === 'n' && workspaceAvailable) return { type: 'open-create' }

  const viewByShortcut: Partial<Record<string, AppView>> = {
    '1': 'dashboard',
    '2': 'templates',
    '3': 'problems',
    '4': 'ai',
    '5': 'data',
    ',': 'settings',
  }
  const view = viewByShortcut[normalizedKey]
  return view ? { type: 'navigate', view } : null
}

function isEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  )
}

export function useAppKeyboardShortcuts({
  onNavigate,
  onOpenCommand,
  onOpenCreate,
  workspaceAvailable,
}: {
  onNavigate: (view: AppView) => void
  onOpenCommand: () => void
  onOpenCreate: () => void
  workspaceAvailable: boolean
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveAppShortcut({
        altKey: event.altKey,
        hasPrimaryModifier: event.metaKey || event.ctrlKey,
        isEditing: isEditingTarget(event.target),
        key: event.key,
        shiftKey: event.shiftKey,
        workspaceAvailable,
      })
      if (!action) return

      event.preventDefault()
      if (action.type === 'open-command') onOpenCommand()
      else if (action.type === 'open-create') onOpenCreate()
      else onNavigate(action.view)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onNavigate, onOpenCommand, onOpenCreate, workspaceAvailable])
}

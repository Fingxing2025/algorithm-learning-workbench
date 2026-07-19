import type { WorkspaceSnapshot } from '@core/contracts/workspace'

import type { AppView } from './app-navigation'

export type AppRoute = AppView | 'loading' | 'onboarding' | 'unavailable'

export function resolveAppRoute({
  currentView,
  isWorkspaceLoading,
  workspace,
}: {
  currentView: AppView
  isWorkspaceLoading: boolean
  workspace: WorkspaceSnapshot | null
}): AppRoute {
  if (currentView === 'ai' || currentView === 'data' || currentView === 'settings') {
    return currentView
  }
  if (isWorkspaceLoading) return 'loading'
  if (!workspace) return 'onboarding'
  if (!workspace.available) return 'unavailable'
  return currentView
}

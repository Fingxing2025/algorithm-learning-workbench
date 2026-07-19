import { describe, expect, it } from 'vitest'

import type { WorkspaceSnapshot } from '@core/contracts/workspace'

import { resolveAppRoute } from './app-route'

const workspace = { available: true } as WorkspaceSnapshot

describe('resolveAppRoute', () => {
  it('keeps settings and management routes available without a workspace', () => {
    expect(
      resolveAppRoute({ currentView: 'settings', isWorkspaceLoading: true, workspace: null }),
    ).toBe('settings')
    expect(
      resolveAppRoute({ currentView: 'data', isWorkspaceLoading: false, workspace: null }),
    ).toBe('data')
  })

  it('resolves workspace lifecycle states before domain pages', () => {
    expect(
      resolveAppRoute({ currentView: 'dashboard', isWorkspaceLoading: true, workspace: null }),
    ).toBe('loading')
    expect(
      resolveAppRoute({ currentView: 'dashboard', isWorkspaceLoading: false, workspace: null }),
    ).toBe('onboarding')
    expect(
      resolveAppRoute({
        currentView: 'templates',
        isWorkspaceLoading: false,
        workspace: { ...workspace, available: false },
      }),
    ).toBe('unavailable')
  })

  it('preserves the selected domain page for an available workspace', () => {
    expect(
      resolveAppRoute({ currentView: 'templates', isWorkspaceLoading: false, workspace }),
    ).toBe('templates')
    expect(resolveAppRoute({ currentView: 'problems', isWorkspaceLoading: false, workspace })).toBe(
      'problems',
    )
  })
})

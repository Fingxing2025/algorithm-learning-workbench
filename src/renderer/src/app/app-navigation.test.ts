import { describe, expect, it } from 'vitest'

import { resolveAppShortcut } from './app-navigation'

const baseShortcut = {
  altKey: false,
  hasPrimaryModifier: true,
  isEditing: false,
  key: '',
  shiftKey: false,
  workspaceAvailable: true,
}

describe('resolveAppShortcut', () => {
  it('keeps command search available while editing', () => {
    expect(resolveAppShortcut({ ...baseShortcut, isEditing: true, key: 'k' })).toEqual({
      type: 'open-command',
    })
  })

  it('maps the six documented navigation shortcuts', () => {
    expect(resolveAppShortcut({ ...baseShortcut, key: '1' })).toEqual({
      type: 'navigate',
      view: 'dashboard',
    })
    expect(resolveAppShortcut({ ...baseShortcut, key: '5' })).toEqual({
      type: 'navigate',
      view: 'data',
    })
    expect(resolveAppShortcut({ ...baseShortcut, key: ',' })).toEqual({
      type: 'navigate',
      view: 'settings',
    })
  })

  it('opens template creation only for an available workspace', () => {
    const shortcut = { ...baseShortcut, key: 'n', shiftKey: true }
    expect(resolveAppShortcut(shortcut)).toEqual({ type: 'open-create' })
    expect(resolveAppShortcut({ ...shortcut, workspaceAvailable: false })).toBeNull()
  })

  it('does not steal navigation or creation shortcuts from form controls', () => {
    expect(resolveAppShortcut({ ...baseShortcut, isEditing: true, key: '2' })).toBeNull()
    expect(
      resolveAppShortcut({
        ...baseShortcut,
        isEditing: true,
        key: 'n',
        shiftKey: true,
      }),
    ).toBeNull()
  })

  it('rejects alternate and unmodified shortcuts', () => {
    expect(resolveAppShortcut({ ...baseShortcut, altKey: true, key: '2' })).toBeNull()
    expect(resolveAppShortcut({ ...baseShortcut, hasPrimaryModifier: false, key: '2' })).toBeNull()
  })
})

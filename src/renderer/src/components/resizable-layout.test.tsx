import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  LAYOUT_STORAGE_PREFIX,
  layoutPreferenceKeys,
  resetLayoutPreferences,
} from '@/hooks/use-layout-preference'

import { ResizableLayout } from './resizable-layout'

function renderLayout(storageKey: string = layoutPreferenceKeys.templateLibrary) {
  render(
    <ResizableLayout
      defaultPrimarySize={292}
      maximumPrimarySize={420}
      minimumPrimarySize={220}
      minimumSecondarySize={360}
      primaryLabel="模板树面板"
      secondaryLabel="模板详情面板"
      separatorLabel="调整模板树宽度"
      storageKey={storageKey}
      valueText={size => `模板树宽度 ${size} 像素`}
    >
      <div>模板树</div>
      <div>模板详情</div>
    </ResizableLayout>,
  )
  return screen.getByRole('separator', { name: '调整模板树宽度' })
}

describe('ResizableLayout', () => {
  it('persists bounded keyboard resizing and exposes separator semantics', () => {
    const separator = renderLayout()

    expect(separator.parentElement).toHaveClass(
      'h-full',
      'grid-rows-[minmax(0,1fr)]',
      'overflow-hidden',
    )
    expect(separator).toHaveAttribute('aria-orientation', 'vertical')
    expect(separator).toHaveAttribute('aria-valuemin', '220')
    expect(separator).toHaveAttribute('aria-valuemax', '420')
    expect(separator).toHaveAttribute('aria-valuenow', '292')
    expect(separator).toHaveAttribute('aria-valuetext', '模板树宽度 292 像素')

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator).toHaveAttribute('aria-valuenow', '300')
    expect(window.localStorage.getItem(`${LAYOUT_STORAGE_PREFIX}template-library`)).toBe('300')

    fireEvent.keyDown(separator, { key: 'End' })
    expect(separator).toHaveAttribute('aria-valuenow', '420')

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator).toHaveAttribute('aria-valuenow', '420')

    fireEvent.keyDown(separator, { key: 'Home' })
    expect(separator).toHaveAttribute('aria-valuenow', '220')
  })

  it('falls back from invalid persisted values and resets with Enter or Space', () => {
    window.localStorage.setItem(`${LAYOUT_STORAGE_PREFIX}template-library`, '9999')
    const separator = renderLayout()

    expect(separator).toHaveAttribute('aria-valuenow', '292')
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(separator).toHaveAttribute('aria-valuenow', '284')
    fireEvent.keyDown(separator, { key: 'Enter' })
    expect(separator).toHaveAttribute('aria-valuenow', '292')
    expect(window.localStorage.getItem(`${LAYOUT_STORAGE_PREFIX}template-library`)).toBeNull()

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    fireEvent.keyDown(separator, { key: ' ' })
    expect(separator).toHaveAttribute('aria-valuenow', '292')
  })

  it('resets every stable layout key without touching unrelated preferences', () => {
    const separator = renderLayout(layoutPreferenceKeys.problemWorkspace)
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    window.localStorage.setItem(`${LAYOUT_STORAGE_PREFIX}app-navigation`, '240')
    window.localStorage.setItem('ui:theme', 'dark')

    act(() => resetLayoutPreferences())

    expect(separator).toHaveAttribute('aria-valuenow', '292')
    expect(window.localStorage.getItem(`${LAYOUT_STORAGE_PREFIX}problem-workspace`)).toBeNull()
    expect(window.localStorage.getItem(`${LAYOUT_STORAGE_PREFIX}app-navigation`)).toBeNull()
    expect(window.localStorage.getItem('ui:theme')).toBe('dark')
  })
})

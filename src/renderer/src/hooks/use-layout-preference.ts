import { useCallback, useEffect, useState } from 'react'

export const LAYOUT_STORAGE_PREFIX = 'ui:layout:v1:'
export const LAYOUT_RESET_EVENT = 'algorithm-workbench:reset-layout'

export const layoutPreferenceKeys = {
  appNavigation: 'app-navigation',
  aiProviderWorkspace: 'ai-provider-workspace',
  problemWorkspace: 'problem-workspace',
  templateLibrary: 'template-library',
} as const

interface LayoutPreferenceOptions {
  defaultSize: number
  maximumSize: number
  minimumSize: number
  storageKey: string
}

function persistedKey(storageKey: string): string {
  return `${LAYOUT_STORAGE_PREFIX}${storageKey}`
}

function readPreference({
  defaultSize,
  maximumSize,
  minimumSize,
  storageKey,
}: LayoutPreferenceOptions): number {
  const stored = Number(window.localStorage.getItem(persistedKey(storageKey)))
  if (!Number.isFinite(stored) || stored < minimumSize || stored > maximumSize) {
    return defaultSize
  }
  return stored
}

export function resetLayoutPreferences(): void {
  Object.values(layoutPreferenceKeys).forEach(storageKey => {
    window.localStorage.removeItem(persistedKey(storageKey))
  })
  window.dispatchEvent(new Event(LAYOUT_RESET_EVENT))
}

export function useLayoutPreference(options: LayoutPreferenceOptions) {
  const [size, setSizeState] = useState(() => readPreference(options))

  useEffect(() => {
    const reset = () => setSizeState(options.defaultSize)
    window.addEventListener(LAYOUT_RESET_EVENT, reset)
    return () => window.removeEventListener(LAYOUT_RESET_EVENT, reset)
  }, [options.defaultSize])

  const setSize = useCallback(
    (nextSize: number) => {
      const bounded = Math.min(options.maximumSize, Math.max(options.minimumSize, nextSize))
      const rounded = Math.round(bounded)
      setSizeState(rounded)
      window.localStorage.setItem(persistedKey(options.storageKey), String(rounded))
    },
    [options.maximumSize, options.minimumSize, options.storageKey],
  )

  const reset = useCallback(() => {
    window.localStorage.removeItem(persistedKey(options.storageKey))
    setSizeState(options.defaultSize)
  }, [options.defaultSize, options.storageKey])

  return { reset, setSize, size }
}

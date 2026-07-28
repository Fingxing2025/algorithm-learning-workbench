import { useCallback, useRef, useState } from 'react'

import { activeElementOrNull } from '@/lib/focus-management'

export const gettingStartedSeenStorageKey = 'ui:getting-started:v1:seen'

function hasSeenGettingStartedGuide(): boolean {
  try {
    return window.localStorage.getItem(gettingStartedSeenStorageKey) === 'true'
  } catch {
    return false
  }
}

function markGettingStartedGuideSeen() {
  try {
    window.localStorage.setItem(gettingStartedSeenStorageKey, 'true')
  } catch {
    // If storage is unavailable, the guide safely appears again next launch.
  }
}

export function useAppDialogs() {
  const [commandOpen, setCommandOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [guideOpen, setGuideOpenState] = useState(() => !hasSeenGettingStartedGuide())
  const commandReturnFocusRef = useRef<HTMLElement | null>(null)
  const createReturnFocusRef = useRef<HTMLElement | null>(null)
  const guideReturnFocusRef = useRef<HTMLElement | null>(null)

  const openCommandPalette = useCallback(() => {
    commandReturnFocusRef.current = activeElementOrNull()
    setCommandOpen(true)
  }, [])

  const openCreateDialog = useCallback(() => {
    createReturnFocusRef.current = activeElementOrNull()
    setCreateOpen(true)
  }, [])

  const openGuide = useCallback(() => {
    guideReturnFocusRef.current = activeElementOrNull()
    setGuideOpenState(true)
  }, [])

  const setGuideOpen = useCallback((open: boolean) => {
    setGuideOpenState(open)
    if (!open) markGettingStartedGuideSeen()
  }, [])

  return {
    commandOpen,
    commandReturnFocusRef,
    createOpen,
    createReturnFocusRef,
    guideOpen,
    guideReturnFocusRef,
    openCommandPalette,
    openCreateDialog,
    openGuide,
    setCommandOpen,
    setCreateOpen,
    setGuideOpen,
  }
}

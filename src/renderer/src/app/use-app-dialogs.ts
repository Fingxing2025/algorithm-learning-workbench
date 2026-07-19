import { useCallback, useRef, useState } from 'react'

import { activeElementOrNull } from '@/lib/focus-management'

export function useAppDialogs() {
  const [commandOpen, setCommandOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const commandReturnFocusRef = useRef<HTMLElement | null>(null)
  const createReturnFocusRef = useRef<HTMLElement | null>(null)

  const openCommandPalette = useCallback(() => {
    commandReturnFocusRef.current = activeElementOrNull()
    setCommandOpen(true)
  }, [])

  const openCreateDialog = useCallback(() => {
    createReturnFocusRef.current = activeElementOrNull()
    setCreateOpen(true)
  }, [])

  return {
    commandOpen,
    commandReturnFocusRef,
    createOpen,
    createReturnFocusRef,
    openCommandPalette,
    openCreateDialog,
    setCommandOpen,
    setCreateOpen,
  }
}

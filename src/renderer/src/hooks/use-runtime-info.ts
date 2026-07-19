import { useEffect, useState } from 'react'

import type { RuntimeInfo } from '@core/contracts/runtime'

export type RuntimeState =
  { status: 'loading' } | { status: 'ready'; value: RuntimeInfo } | { status: 'error' }

export function useRuntimeInfo(): RuntimeState {
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({ status: 'loading' })

  useEffect(() => {
    let isActive = true

    window.desktop.app
      .getRuntimeInfo()
      .then(value => {
        if (isActive) {
          setRuntimeState({ status: 'ready', value })
        }
      })
      .catch(() => {
        if (isActive) {
          setRuntimeState({ status: 'error' })
        }
      })

    return () => {
      isActive = false
    }
  }, [])

  return runtimeState
}

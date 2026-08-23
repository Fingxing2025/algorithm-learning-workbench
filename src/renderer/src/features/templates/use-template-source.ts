import { useCallback, useEffect, useState } from 'react'

import type { TemplateSource } from '@core/contracts/workspace'

export type TemplateSourceState =
  | { status: 'error'; message: string }
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; value: TemplateSource }

export function useTemplateSource(templateId: string | null) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<TemplateSourceState>({ status: 'idle' })

  useEffect(() => {
    if (!templateId) {
      setState({ status: 'idle' })
      return
    }

    let isActive = true
    setState({ status: 'loading' })
    window.desktop.templates
      .readSource(templateId)
      .then(value => {
        if (isActive) {
          setState({ status: 'ready', value })
        }
      })
      .catch(error => {
        if (isActive) {
          setState({
            message: error instanceof Error ? error.message : '无法读取模板源码。',
            status: 'error',
          })
        }
      })

    return () => {
      isActive = false
    }
  }, [reloadToken, templateId])

  return {
    reload: useCallback(() => setReloadToken(value => value + 1), []),
    state,
  }
}

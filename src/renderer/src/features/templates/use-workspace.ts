import { useCallback, useEffect, useState } from 'react'

import type {
  ChooseWorkspaceRequest,
  CreateTemplateRequest,
  TemplateActionRequest,
  WorkspaceSnapshot,
} from '@core/contracts/workspace'
import type { ImportTemplateRequest } from '@core/contracts/template-management'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。'
}

export function useWorkspace() {
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null)

  useEffect(() => {
    let isActive = true
    window.desktop.workspace
      .getCurrent()
      .then(value => {
        if (isActive) {
          setWorkspace(value)
        }
      })
      .catch(caughtError => {
        if (isActive) {
          setError(getErrorMessage(caughtError))
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [])

  const chooseWorkspace = useCallback(async (request: ChooseWorkspaceRequest) => {
    setError(null)
    setIsBusy(true)
    try {
      const value = await window.desktop.workspace.choose(request)
      if (value) {
        setWorkspace(value)
      }
      return value
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return null
    } finally {
      setIsBusy(false)
    }
  }, [])

  const rescan = useCallback(async () => {
    setError(null)
    setIsBusy(true)
    try {
      const value = await window.desktop.workspace.rescan()
      setWorkspace(value)
      return value
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return null
    } finally {
      setIsBusy(false)
    }
  }, [])

  const createTemplate = useCallback(async (request: CreateTemplateRequest) => {
    setError(null)
    setIsBusy(true)
    try {
      const result = await window.desktop.templates.create(request)
      setWorkspace(result.workspace)
      return result
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return null
    } finally {
      setIsBusy(false)
    }
  }, [])

  const importTemplate = useCallback(async (request: ImportTemplateRequest) => {
    setError(null)
    setIsBusy(true)
    try {
      const result = await window.desktop.templateManagement.importTemplate(request)
      setWorkspace(result.workspace)
      return result
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return null
    } finally {
      setIsBusy(false)
    }
  }, [])

  const performTemplateAction = useCallback(async (request: TemplateActionRequest) => {
    setError(null)
    try {
      await window.desktop.templates.performAction(request)
      return true
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return false
    }
  }, [])

  return {
    chooseWorkspace,
    clearError: () => setError(null),
    createTemplate,
    error,
    isBusy,
    isLoading,
    importTemplate,
    performTemplateAction,
    rescan,
    workspace,
  }
}

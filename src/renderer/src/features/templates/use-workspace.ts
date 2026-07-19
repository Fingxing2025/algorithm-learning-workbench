import { useCallback, useEffect, useState } from 'react'

import type {
  ChooseWorkspaceRequest,
  CreateTemplateRequest,
  TemplateActionRequest,
  TemplatePage,
  TemplateSummary,
  WorkspaceSnapshot,
} from '@core/contracts/workspace'
import type { ImportTemplateRequest } from '@core/contracts/template-management'
import type { BackgroundTaskStatus } from '@core/contracts/background-task'

import { waitForBackgroundTask } from '@/lib/background-task'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。'
}

export function useWorkspace() {
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMoreTemplates, setIsLoadingMoreTemplates] = useState(false)
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null)
  const [scanTask, setScanTask] = useState<BackgroundTaskStatus | null>(null)

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
      const initial = await window.desktop.workspace.startRescan({ requestId: crypto.randomUUID() })
      const completed = await waitForBackgroundTask(initial, setScanTask)
      if (completed.state !== 'completed' || completed.result?.kind !== 'workspace-scan')
        return null
      setWorkspace(completed.result.workspace)
      return completed.result.workspace
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return null
    } finally {
      setIsBusy(false)
    }
  }, [])

  const cancelRescan = useCallback(async () => {
    if (!scanTask || !['queued', 'running', 'cancelling'].includes(scanTask.state)) return false
    try {
      const cancelled = await window.desktop.backgroundTasks.cancel({ taskId: scanTask.id })
      setScanTask(cancelled)
      setIsBusy(false)
      return true
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return false
    }
  }, [scanTask])

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

  const deleteTemplate = useCallback(async (templateId: string) => {
    setError(null)
    setIsBusy(true)
    try {
      const result = await window.desktop.templateManagement.deleteTemplate(templateId)
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

  const loadMoreTemplates = useCallback(async () => {
    const currentWorkspace = workspace
    const cursor = currentWorkspace?.templatePage.nextCursor
    if (!currentWorkspace || !cursor || isLoadingMoreTemplates) return null
    setIsLoadingMoreTemplates(true)
    try {
      const page = await window.desktop.templates.listPage({ cursor, limit: 500, query: '' })
      setWorkspace(current => {
        if (!current || current.id !== currentWorkspace.id) return current
        const known = new Set(current.templates.map(template => template.id))
        const templates = [
          ...current.templates,
          ...page.items.filter(item => !known.has(item.id)),
        ].sort(
          (left, right) =>
            left.relativePath.localeCompare(right.relativePath) || left.id.localeCompare(right.id),
        )
        return {
          ...current,
          templatePage: {
            nextAction: page.nextAction,
            nextCursor: page.nextCursor,
            processedCount: templates.length,
            totalCount: page.totalCount,
            truncated: page.truncated,
            truncatedReason: page.truncatedReason,
          },
          templates,
        }
      })
      return page
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return null
    } finally {
      setIsLoadingMoreTemplates(false)
    }
  }, [isLoadingMoreTemplates, workspace])

  const loadTemplate = useCallback(
    async (templateId: string): Promise<TemplateSummary | null> => {
      const existing = workspace?.templates.find(template => template.id === templateId)
      if (existing) return existing
      try {
        const template = await window.desktop.templates.getSummary({ templateId })
        setWorkspace(current => {
          if (!current || current.id !== workspace?.id) return current
          const templates = [
            ...current.templates.filter(item => item.id !== template.id),
            template,
          ].sort(
            (left, right) =>
              left.relativePath.localeCompare(right.relativePath) ||
              left.id.localeCompare(right.id),
          )
          return {
            ...current,
            templatePage: { ...current.templatePage, processedCount: templates.length },
            templates,
          }
        })
        return template
      } catch (caughtError) {
        setError(getErrorMessage(caughtError))
        return null
      }
    },
    [workspace],
  )

  const searchTemplates = useCallback(async (query: string): Promise<TemplatePage> => {
    return window.desktop.templates.listPage({ cursor: null, limit: 200, query })
  }, [])

  return {
    chooseWorkspace,
    cancelRescan,
    clearError: () => setError(null),
    createTemplate,
    deleteTemplate,
    error,
    isBusy,
    isLoading,
    isLoadingMoreTemplates,
    importTemplate,
    loadMoreTemplates,
    loadTemplate,
    performTemplateAction,
    replaceWorkspace: setWorkspace,
    rescan,
    scanTask,
    searchTemplates,
    workspace,
  }
}

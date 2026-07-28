import { useCallback, useEffect, useState } from 'react'

import type {
  TemplateMetadata,
  UpdateTemplateMetadataRequest,
} from '@core/contracts/template-management'

export function useTemplateMetadata(templateId: string | null, refreshKey = 0) {
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [metadata, setMetadata] = useState<TemplateMetadata | null>(null)

  useEffect(() => {
    if (!templateId) {
      setMetadata(null)
      return
    }
    let active = true
    setIsLoading(true)
    setError(null)
    window.desktop.templateManagement
      .getMetadata(templateId)
      .then(value => active && setMetadata(value))
      .catch(
        caught => active && setError(caught instanceof Error ? caught.message : '无法读取元数据。'),
      )
      .finally(() => active && setIsLoading(false))
    return () => {
      active = false
    }
  }, [refreshKey, templateId])

  const update = useCallback(async (request: UpdateTemplateMetadataRequest) => {
    setIsBusy(true)
    setError(null)
    try {
      const value = await window.desktop.templateManagement.updateMetadata(request)
      setMetadata(value)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法保存模板元数据。')
      return false
    } finally {
      setIsBusy(false)
    }
  }, [])

  return { error, isBusy, isLoading, metadata, update }
}

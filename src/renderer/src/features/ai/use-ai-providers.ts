import { useCallback, useEffect, useState } from 'react'

import type {
  AiConnectionResult,
  AiProviderProfile,
  AiTaskRoute,
  CreateAiProviderRequest,
  UpdateAiProviderRequest,
  UpsertAiTaskRouteRequest,
} from '@core/contracts/ai-provider'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。'
}

export function useAiProviders() {
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [profiles, setProfiles] = useState<AiProviderProfile[]>([])
  const [routes, setRoutes] = useState<AiTaskRoute[]>([])

  const load = useCallback(async () => {
    setError(null)
    try {
      const [nextProfiles, nextRoutes] = await Promise.all([
        window.desktop.aiProviders.list(),
        window.desktop.aiProviders.listRoutes(),
      ])
      setProfiles(nextProfiles)
      setRoutes(nextRoutes)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const mutate = useCallback(async <Value>(operation: () => Promise<Value>) => {
    setError(null)
    setIsBusy(true)
    try {
      return await operation()
    } catch (caught) {
      setError(errorMessage(caught))
      return null
    } finally {
      setIsBusy(false)
    }
  }, [])

  return {
    clearError: () => setError(null),
    create: (request: CreateAiProviderRequest) =>
      mutate(async () => {
        const profile = await window.desktop.aiProviders.create(request)
        setProfiles(current => [profile, ...current])
        return profile
      }),
    deleteProfile: (id: string) =>
      mutate(async () => {
        await window.desktop.aiProviders.delete({ id })
        setProfiles(current => current.filter(profile => profile.id !== id))
        setRoutes(current => current.filter(route => route.providerId !== id))
        return true
      }),
    error,
    isBusy,
    isLoading,
    profiles,
    routes,
    testConnection: (id: string): Promise<AiConnectionResult | null> =>
      mutate(() => window.desktop.aiProviders.testConnection({ id })),
    update: (request: UpdateAiProviderRequest) =>
      mutate(async () => {
        const profile = await window.desktop.aiProviders.update(request)
        setProfiles(current => [profile, ...current.filter(item => item.id !== profile.id)])
        return profile
      }),
    upsertRoute: (request: UpsertAiTaskRouteRequest) =>
      mutate(async () => {
        const route = await window.desktop.aiProviders.upsertRoute(request)
        setRoutes(current => [route, ...current.filter(item => item.task !== route.task)])
        return route
      }),
  }
}

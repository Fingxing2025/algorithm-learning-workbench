import { useCallback, useEffect, useState } from 'react'

import type {
  CreateProblemRequest,
  Problem,
  ProblemPage,
  RemoveProblemImageRequest,
  RemoveProblemRelationRequest,
  UpdateProblemRequest,
  UpsertProblemRelationRequest,
} from '@core/contracts/problem'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。'
}

export function useProblems() {
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [matchedCount, setMatchedCount] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [query, setQuery] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [totalRelationCount, setTotalRelationCount] = useState(0)

  const applyPage = useCallback((page: ProblemPage, append: boolean) => {
    setProblems(current => {
      if (!append) return page.items
      const known = new Set(current.map(problem => problem.id))
      return [...current, ...page.items.filter(problem => !known.has(problem.id))]
    })
    setNextCursor(page.nextCursor)
    setMatchedCount(page.matchedCount)
    setTotalCount(page.totalCount)
    setTotalRelationCount(page.totalRelationCount)
    return page.items
  }, [])

  const replaceProblem = useCallback(
    (problem: Problem) => {
      const previous = problems.find(item => item.id === problem.id)
      if (!previous) setTotalCount(count => count + 1)
      setTotalRelationCount(count =>
        Math.max(0, count - (previous?.relations.length ?? 0) + problem.relations.length),
      )
      setProblems(current =>
        [problem, ...current.filter(item => item.id !== problem.id)].sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
        ),
      )
      return problem
    },
    [problems],
  )

  const loadProblems = useCallback(
    async (searchQuery: string) => {
      setIsLoading(true)
      setError(null)
      try {
        const page = await window.desktop.problems.listPage({
          cursor: null,
          limit: 100,
          query: searchQuery,
        })
        setQuery(searchQuery)
        applyPage(page, false)
        return page.items
      } catch (caughtError) {
        setError(getErrorMessage(caughtError))
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [applyPage],
  )

  useEffect(() => {
    let isActive = true
    window.desktop.problems
      .listPage({ cursor: null, limit: 100, query: '' })
      .then(page => {
        if (isActive) applyPage(page, false)
      })
      .catch(caughtError => {
        if (isActive) setError(getErrorMessage(caughtError))
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })
    return () => {
      isActive = false
    }
  }, [applyPage])

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return null
    setIsLoadingMore(true)
    setError(null)
    try {
      const page = await window.desktop.problems.listPage({ cursor: nextCursor, limit: 100, query })
      return applyPage(page, true)
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
      return null
    } finally {
      setIsLoadingMore(false)
    }
  }, [applyPage, isLoadingMore, nextCursor, query])

  const loadProblem = useCallback(
    async (problemId: string) => {
      const existing = problems.find(problem => problem.id === problemId)
      if (existing) return existing
      try {
        return replaceProblem(await window.desktop.problems.get({ problemId }))
      } catch (caughtError) {
        setError(getErrorMessage(caughtError))
        return null
      }
    },
    [problems, replaceProblem],
  )

  const searchProblems = useCallback(async (searchQuery: string) => {
    const page = await window.desktop.problems.listPage({
      cursor: null,
      limit: 100,
      query: searchQuery,
    })
    return page.items
  }, [])

  const runMutation = useCallback(
    async (operation: () => Promise<Problem | null>) => {
      setError(null)
      setIsBusy(true)
      try {
        const problem = await operation()
        return problem ? replaceProblem(problem) : null
      } catch (caughtError) {
        setError(getErrorMessage(caughtError))
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [replaceProblem],
  )

  const deleteProblem = useCallback(
    async (problemId: string) => {
      setError(null)
      setIsBusy(true)
      try {
        await window.desktop.problems.delete({ problemId })
        const deleted = problems.find(problem => problem.id === problemId)
        if (deleted) setTotalRelationCount(count => Math.max(0, count - deleted.relations.length))
        setProblems(current => current.filter(problem => problem.id !== problemId))
        setTotalCount(count => Math.max(0, count - 1))
        return true
      } catch (caughtError) {
        setError(getErrorMessage(caughtError))
        return false
      } finally {
        setIsBusy(false)
      }
    },
    [problems],
  )

  return {
    acceptProblem: replaceProblem,
    addImages: (problemId: string) =>
      runMutation(() => window.desktop.problems.addImages(problemId)),
    clearError: () => setError(null),
    createProblem: (request: CreateProblemRequest) =>
      runMutation(() => window.desktop.problems.create(request)),
    deleteProblem,
    error,
    hasMore: Boolean(nextCursor),
    isBusy,
    isLoading,
    isLoadingMore,
    loadMore,
    loadProblem,
    matchedCount,
    problems,
    reload: () => loadProblems(query),
    removeImage: (request: RemoveProblemImageRequest) =>
      runMutation(() => window.desktop.problems.removeImage(request)),
    removeRelation: (request: RemoveProblemRelationRequest) =>
      runMutation(() => window.desktop.problems.removeRelation(request)),
    search: loadProblems,
    searchProblems,
    totalCount,
    totalRelationCount,
    updateProblem: (request: UpdateProblemRequest) =>
      runMutation(() => window.desktop.problems.update(request)),
    upsertRelation: (request: UpsertProblemRelationRequest) =>
      runMutation(() => window.desktop.problems.upsertRelation(request)),
  }
}

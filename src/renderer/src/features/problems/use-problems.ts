import { useCallback, useEffect, useState } from 'react'

import type {
  CreateProblemRequest,
  Problem,
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
  const [problems, setProblems] = useState<Problem[]>([])

  const replaceProblem = useCallback((problem: Problem) => {
    setProblems(current =>
      [problem, ...current.filter(item => item.id !== problem.id)].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    )
    return problem
  }, [])

  useEffect(() => {
    let isActive = true
    window.desktop.problems
      .list()
      .then(value => {
        if (isActive) {
          setProblems(value)
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

  return {
    addImages: (problemId: string) =>
      runMutation(() => window.desktop.problems.addImages(problemId)),
    clearError: () => setError(null),
    createProblem: (request: CreateProblemRequest) =>
      runMutation(() => window.desktop.problems.create(request)),
    error,
    isBusy,
    isLoading,
    problems,
    removeImage: (request: RemoveProblemImageRequest) =>
      runMutation(() => window.desktop.problems.removeImage(request)),
    removeRelation: (request: RemoveProblemRelationRequest) =>
      runMutation(() => window.desktop.problems.removeRelation(request)),
    updateProblem: (request: UpdateProblemRequest) =>
      runMutation(() => window.desktop.problems.update(request)),
    upsertRelation: (request: UpsertProblemRelationRequest) =>
      runMutation(() => window.desktop.problems.upsertRelation(request)),
  }
}

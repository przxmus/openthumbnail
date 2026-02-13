import { useCallback, useEffect, useState } from 'react'

import type { Project } from '@/types/workshop'
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
} from '@/lib/storage/repository'
import { ensureSchemaVersion } from '@/lib/storage/db'

export function useProjects() {
  const [projects, setProjects] = useState<Array<Project>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)

    try {
      await ensureSchemaVersion()
      const list = await listProjects()
      setProjects(list)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const create = useCallback(
    async (name?: string) => {
      const project = await createProject(name)
      await reload()
      return project
    },
    [reload],
  )

  const duplicate = useCallback(
    async (projectId: string) => {
      const project = await duplicateProject(projectId)
      await reload()
      return project
    },
    [reload],
  )

  const remove = useCallback(
    async (projectId: string) => {
      await deleteProject(projectId)
      await reload()
    },
    [reload],
  )

  return {
    projects,
    loading,
    error,
    reload,
    create,
    duplicate,
    remove,
  }
}

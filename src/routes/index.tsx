import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useProjects } from '@/lib/hooks/use-projects'

export const Route = createFileRoute('/')({ component: ProjectsPage })

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString()
}

function ProjectsPage() {
  const navigate = useNavigate()
  const { projects, loading, error, create, duplicate, remove } = useProjects()

  const [newProjectName, setNewProjectName] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const summary = useMemo(
    () =>
      `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} stored locally`,
    [projects.length],
  )

  const createProject = async () => {
    setPendingId('create')

    try {
      const project = await create(newProjectName)
      setNewProjectName('')
      await navigate({ to: '/project/$projectId', params: { projectId: project.id } })
    } finally {
      setPendingId(null)
    }
  }

  const openProject = async (projectId: string) => {
    await navigate({ to: '/project/$projectId', params: { projectId } })
  }

  return (
    <main className="from-background via-background to-muted/30 min-h-screen bg-gradient-to-b">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
              OpenThumbnail Workshop
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
            <p className="text-muted-foreground mt-1 text-sm">{summary}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ to: '/settings' })}>
              Settings
            </Button>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Create New Project</CardTitle>
            <CardDescription>
              Create a local workspace for prompts, timeline history, and outputs.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input
              placeholder="Project name"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
            />
            <Button disabled={pendingId !== null} onClick={createProject}>
              New Project
            </Button>
          </CardContent>
        </Card>

        {error ? (
          <Card className="border-destructive/30">
            <CardContent className="text-destructive pt-6 text-sm">{error}</CardContent>
          </Card>
        ) : null}

        {loading ? (
          <Card>
            <CardContent className="text-muted-foreground pt-6 text-sm">
              Loading projects...
            </CardContent>
          </Card>
        ) : null}

        {!loading && projects.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground pt-6 text-sm">
              No projects yet. Create your first workspace to start generating thumbnails.
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} size="sm" className="gap-3">
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>
                  Updated {formatDate(project.updatedAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1 text-xs">
                <p className="text-muted-foreground">Default model: {project.defaultModel ?? 'none'}</p>
                <p className="text-muted-foreground">
                  Canvas: {project.defaultResolution} / {project.defaultAspectRatio}
                </p>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={pendingId !== null}
                  onClick={() => {
                    void openProject(project.id)
                  }}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId !== null}
                  onClick={async () => {
                    setPendingId(project.id)
                    try {
                      const cloned = await duplicate(project.id)
                      await navigate({
                        to: '/project/$projectId',
                        params: { projectId: cloned.id },
                      })
                    } finally {
                      setPendingId(null)
                    }
                  }}
                >
                  Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pendingId !== null}
                  onClick={async () => {
                    setPendingId(project.id)

                    try {
                      await remove(project.id)
                    } finally {
                      setPendingId(null)
                    }
                  }}
                >
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </section>
      </div>
    </main>
  )
}

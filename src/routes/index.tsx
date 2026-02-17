import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { m } from '@/paraglide/messages.js'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  const [projectIdPendingDelete, setProjectIdPendingDelete] = useState<string | null>(null)

  const summary = useMemo(() => {
    if (projects.length === 1) {
      return m.projects_summary_one({ count: String(projects.length) })
    }

    return m.projects_summary({ count: String(projects.length) })
  }, [projects.length])

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
              {m.app_name()}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{m.projects_title()}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{summary}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ to: '/settings' })}>
              {m.settings_title()}
            </Button>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{m.projects_create_title()}</CardTitle>
            <CardDescription>{m.projects_create_description()}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input
              placeholder={m.projects_create_placeholder()}
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || pendingId !== null) {
                  return
                }

                event.preventDefault()
                void createProject()
              }}
            />
            <Button disabled={pendingId !== null} onClick={createProject}>
              {m.projects_create_button()}
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
              {m.projects_loading()}
            </CardContent>
          </Card>
        ) : null}

        {!loading && projects.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground pt-6 text-sm">
              {m.projects_empty()}
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              size="sm"
              className="group gap-3 transition hover:border-primary/60"
              role="button"
              tabIndex={0}
              onClick={() => {
                void openProject(project.id)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                  return
                }

                event.preventDefault()
                void openProject(project.id)
              }}
            >
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>{formatDate(project.updatedAt)}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1 text-xs">
                <p className="text-muted-foreground">
                  {m.projects_default_model({ model: project.defaultModel ?? m.common_none() })}
                </p>
                <p className="text-muted-foreground">
                  {m.projects_default_canvas({
                    resolution: project.defaultResolution,
                    ratio: project.defaultAspectRatio,
                  })}
                </p>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={pendingId !== null}
                  onClick={(event) => {
                    event.stopPropagation()
                    void openProject(project.id)
                  }}
                >
                  {m.projects_open()}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId !== null}
                  onClick={async (event) => {
                    event.stopPropagation()
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
                  {m.projects_duplicate()}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pendingId !== null}
                  onClick={(event) => {
                    event.stopPropagation()
                    setProjectIdPendingDelete(project.id)
                  }}
                >
                  {m.projects_delete()}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </section>
      </div>

      <AlertDialog
        open={projectIdPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setProjectIdPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogTitle>{m.projects_delete_confirm_title()}</AlertDialogTitle>
            <AlertDialogDescription>{m.projects_delete_confirm_description()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_close()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!projectIdPendingDelete) {
                  return
                }

                const deletingProjectId = projectIdPendingDelete
                setProjectIdPendingDelete(null)
                setPendingId(deletingProjectId)

                try {
                  await remove(deletingProjectId)
                } finally {
                  setPendingId(null)
                }
              }}
            >
              {m.projects_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

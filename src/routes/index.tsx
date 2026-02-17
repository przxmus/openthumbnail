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
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useProjects } from '@/lib/hooks/use-projects'

export const Route = createFileRoute('/')({ component: ProjectsPage })

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ProjectsPage() {
  const navigate = useNavigate()
  const { projects, loading, error, create, duplicate, remove } = useProjects()

  const [newProjectName, setNewProjectName] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [projectIdPendingDelete, setProjectIdPendingDelete] = useState<
    string | null
  >(null)

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
      await navigate({
        to: '/project/$projectId',
        params: { projectId: project.id },
      })
    } finally {
      setPendingId(null)
    }
  }

  const openProject = async (projectId: string) => {
    await navigate({ to: '/project/$projectId', params: { projectId } })
  }

  return (
    <main className="from-background via-background to-muted/40 min-h-screen bg-gradient-to-br">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 md:px-8">
        {/* Hero header */}
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
              {m.app_name()}
            </p>
            <h1 className="text-4xl font-bold tracking-tight">
              {m.projects_title()}
            </h1>
            <p className="text-muted-foreground text-sm">{summary}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate({ to: '/settings' })}
          >
            {m.settings_title()}
          </Button>
        </section>

        <Separator />

        {/* Create project */}
        <Card className="border-primary/20 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">
              {m.projects_create_title()}
            </CardTitle>
            <CardDescription>{m.projects_create_description()}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input
              className="flex-1"
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
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="text-destructive pt-6 text-sm">
              {error}
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="bg-muted h-5 w-3/4 rounded" />
                  <div className="bg-muted h-4 w-1/2 rounded" />
                </CardHeader>
                <CardContent>
                  <div className="bg-muted h-4 w-full rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        {!loading && projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted-foreground h-8 w-8"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M12 8v8" />
                  <path d="M8 12h8" />
                </svg>
              </div>
              <p className="text-muted-foreground text-sm">
                {m.projects_empty()}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {/* Project grid */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="group hover:shadow-primary/5 hover:border-primary/40 relative cursor-pointer gap-2 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
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
              {/* Accent bar */}
              <div className="bg-primary/60 absolute top-0 left-0 h-1 w-full opacity-0 transition-opacity group-hover:opacity-100" />

              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">
                    {project.name}
                  </CardTitle>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {formatDate(project.updatedAt)}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {formatTime(project.updatedAt)}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-1.5 pb-2">
                <div className="flex flex-wrap gap-1.5">
                  {project.defaultModel ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {project.defaultModel.split('/').pop()}
                    </Badge>
                  ) : null}
                  <Badge variant="secondary" className="text-[10px]">
                    {project.defaultResolution}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {project.defaultAspectRatio}
                  </Badge>
                </div>
              </CardContent>

              <CardFooter className="flex flex-wrap gap-2 pt-0">
                <Button
                  size="sm"
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
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
            <AlertDialogTitle>
              {m.projects_delete_confirm_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.projects_delete_confirm_description()}
            </AlertDialogDescription>
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

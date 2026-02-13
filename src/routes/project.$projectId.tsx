import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent } from 'react'
import type { EditOperations, ModelCapability, OutputAsset, TimelineStep } from '@/types/workshop'

import { m } from '@/paraglide/messages.js'
import { AssetThumb } from '@/components/workshop/asset-thumb'
import { ImageEditorModal } from '@/components/workshop/image-editor-modal'
import { PersonaManagerModal } from '@/components/workshop/persona-manager-modal'
import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ASPECT_RATIOS, MAX_OUTPUTS_UI } from '@/lib/constants/workshop'
import { useWorkshopProject } from '@/lib/hooks/use-workshop-project'
import { loadPromptDraft, savePromptDraft } from '@/lib/storage/settings'

export const Route = createFileRoute('/project/$projectId')({
  component: ProjectWorkshopPage,
})

const DEFAULT_EDITOR_OPS: EditOperations = {
  cropX: 0,
  cropY: 0,
  cropWidth: 100,
  cropHeight: 100,
  rotate: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  sharpen: 0,
}

function formatDate(value: number) {
  return new Date(value).toLocaleString()
}

function bytesToSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getModelCapability(models: Array<ModelCapability>, modelId: string) {
  return models.find((model) => model.id === modelId)
}

function sliderClassName() {
  return 'accent-primary h-2 w-full min-w-0 rounded-full overflow-hidden'
}

function ProjectWorkshopPage() {
  const navigate = useNavigate()
  const params = Route.useParams()

  const backupInputRef = useRef<HTMLInputElement | null>(null)
  const referenceInputRef = useRef<HTMLInputElement | null>(null)
  const initializedProjectIdRef = useRef<string | null>(null)

  const {
    loading,
    busy,
    error,
    project,
    steps,
    assetsMap,
    referenceAssets,
    outputAssets,
    personas,
    models,
    quotaState,
    settings,
    updateProjectDefaults,
    uploadReferenceFiles,
    importYoutubeThumbnail,
    createPersona,
    renamePersonaItem,
    addPersonaImages,
    removePersonaImage,
    removePersona,
    removeReferenceImage,
    generateStep,
    createEditStep,
    exportSingleAsset,
    exportProjectBatch,
    exportBackup,
    importBackup,
    cleanupCandidates,
    removeProjectAndRefresh,
    missingReferenceIdsByStep,
  } = useWorkshopProject(params.projectId)

  const [modelId, setModelId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:3' | '16:9' | '9:16'>('16:9')
  const [resolutionPreset, setResolutionPreset] = useState<'720p' | '1080p'>('720p')
  const [outputCount, setOutputCount] = useState(1)
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Array<string>>([])
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Array<string>>([])
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [editorSourceAssetId, setEditorSourceAssetId] = useState<string | null>(null)
  const [editorOperations, setEditorOperations] = useState<EditOperations>(DEFAULT_EDITOR_OPS)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false)
  const [remixOfStepId, setRemixOfStepId] = useState<string | undefined>(undefined)
  const [remixOfAssetId, setRemixOfAssetId] = useState<string | undefined>(undefined)
  const [cleanupStateVisible, setCleanupStateVisible] = useState(false)
  const [cleanupRows, setCleanupRows] = useState<
    Array<{ project: { id: string; name: string }; bytes: number }>
  >([])

  const modelCapability = useMemo(
    () => getModelCapability(models, modelId),
    [modelId, models],
  )

  const supportsNegativePrompt = modelCapability?.supportsNegativePrompt ?? false
  const supportsReferences = modelCapability?.supportsReferences ?? false
  const maxOutputs = Math.max(1, Math.min(MAX_OUTPUTS_UI, modelCapability?.maxOutputs ?? 1))

  const selectedEditorAsset = editorSourceAssetId
    ? assetsMap.get(editorSourceAssetId) ?? null
    : null

  useEffect(() => {
    if (!project) {
      return
    }

    if (initializedProjectIdRef.current === project.id) {
      return
    }

    initializedProjectIdRef.current = project.id

    setAspectRatio(project.defaultAspectRatio)
    setResolutionPreset(project.defaultResolution)

    if (project.defaultModel) {
      setModelId(project.defaultModel)
    } else if (settings.lastUsedModel) {
      setModelId(settings.lastUsedModel)
    }

    const draft = loadPromptDraft(project.id)
    setPrompt(draft.prompt)
    setNegativePrompt(draft.negativePrompt)
  }, [project, settings.lastUsedModel])

  useEffect(() => {
    if (modelId || !models.length) {
      return
    }

    const available = models.find((entry) => entry.availability === 'available')
    if (available) {
      setModelId(available.id)
    }
  }, [modelId, models])

  useEffect(() => {
    if (!project) {
      return
    }

    savePromptDraft(project.id, {
      prompt,
      negativePrompt,
    })
  }, [negativePrompt, project, prompt])

  useEffect(() => {
    setOutputCount((current) => Math.max(1, Math.min(current, maxOutputs)))
  }, [maxOutputs])

  useEffect(() => {
    const allowed = new Set(referenceAssets.map((asset) => asset.id))
    setSelectedReferenceIds((current) => {
      const next = current.filter((assetId) => allowed.has(assetId))
      return next.length === current.length ? current : next
    })
  }, [referenceAssets])

  useEffect(() => {
    const allowed = new Set(personas.map((persona) => persona.id))
    setSelectedPersonaIds((current) => {
      const next = current.filter((personaId) => allowed.has(personaId))
      return next.length === current.length ? current : next
    })
  }, [personas])

  const unavailableModelSelected = modelCapability?.availability === 'unavailable'

  const onReferenceFiles = async (files: Array<File>) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) {
      return
    }

    await uploadReferenceFiles(imageFiles)
  }

  const onDropReferences = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files)
    await onReferenceFiles(files)
  }

  const onPasteReferences = async (event: ClipboardEvent<HTMLElement>) => {
    const items = Array.from(event.clipboardData.items)
    const files = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (!files.length) {
      return
    }

    event.preventDefault()
    await onReferenceFiles(files)
  }

  const onGenerate = async () => {
    if (!project || !modelId) {
      return
    }

    await generateStep({
      modelId,
      prompt,
      negativePrompt,
      referenceAssetIds: selectedReferenceIds,
      personaIds: selectedPersonaIds,
      aspectRatio,
      resolutionPreset,
      outputCount,
      remixOfStepId,
      remixOfAssetId,
      modelCapability,
    })

    setRemixOfStepId(undefined)
    setRemixOfAssetId(undefined)
  }

  const onImportYoutube = async () => {
    await importYoutubeThumbnail(youtubeUrl)
    setYoutubeUrl('')
  }

  const onLoadCleanup = async () => {
    const rows = await cleanupCandidates()
    setCleanupRows(rows.map((entry) => ({ project: entry.project, bytes: entry.bytes })))
  }

  const onRemixFrom = (step: TimelineStep, outputAssetId: string) => {
    if (step.type !== 'generation') {
      return
    }

    setModelId(step.input.modelId)
    setPrompt(step.input.prompt)
    setNegativePrompt(step.input.negativePrompt ?? '')
    setAspectRatio(step.input.aspectRatio)
    setResolutionPreset(step.input.resolutionPreset)
    setOutputCount(step.input.outputCount)
    setSelectedReferenceIds(Array.from(new Set([outputAssetId, ...step.input.referenceAssetIds])))
    setSelectedPersonaIds(step.input.personaIds)
    setRemixOfStepId(step.id)
    setRemixOfAssetId(outputAssetId)
  }

  const openEditorForAsset = (assetId: string) => {
    setEditorSourceAssetId(assetId)
    setEditorOperations(DEFAULT_EDITOR_OPS)
    setIsEditorOpen(true)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">{m.loading_workshop()}</p>
      </main>
    )
  }

  if (!project) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Card>
          <CardHeader>
            <CardTitle>{m.project_not_found_title()}</CardTitle>
            <CardDescription>{m.project_not_found_description()}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => navigate({ to: '/' })}>{m.project_not_found_back()}</Button>
          </CardFooter>
        </Card>
      </main>
    )
  }

  return (
    <main
      className="from-background via-background to-muted/25 min-h-screen bg-gradient-to-br"
      onPaste={(event) => {
        void onPasteReferences(event)
      }}
    >
      <div className="mx-auto grid w-full max-w-[1600px] min-w-0 gap-6 px-4 py-6 md:px-8 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">{m.project_label()}</p>
                  <CardTitle className="mt-1 text-xl">{project.name}</CardTitle>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate({ to: '/' })}>
                  {m.projects_title()}
                </Button>
              </div>
              <CardDescription>
                {m.project_updated({ date: formatDate(project.updatedAt) })}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Label htmlFor="project-name">{m.project_name_label()}</Label>
              <Input
                id="project-name"
                value={project.name}
                onChange={async (event) => {
                  await updateProjectDefaults({ name: event.target.value })
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => void exportBackup()}>
                  {m.project_backup_export()}
                </Button>
                <Button size="sm" variant="outline" onClick={() => backupInputRef.current?.click()}>
                  {m.project_backup_import()}
                </Button>
              </div>
              <input
                ref={backupInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) {
                    return
                  }

                  void importBackup(file)
                  event.target.value = ''
                }}
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  await removeProjectAndRefresh(project.id)
                  await navigate({ to: '/' })
                }}
              >
                {m.project_delete()}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{m.generation_title()}</CardTitle>
              <CardDescription>{m.generation_description()}</CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-3 overflow-hidden">
              <Label htmlFor="model">{m.generation_model_label()}</Label>
              <select
                id="model"
                value={modelId}
                className="border-input bg-input/30 h-9 w-full min-w-0 rounded-4xl border px-3 text-sm"
                onChange={(event) => setModelId(event.target.value)}
              >
                <option value="">{m.generation_model_placeholder()}</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                    {model.availability === 'unavailable'
                      ? ` ${m.generation_model_unavailable_suffix()}`
                      : ''}
                  </option>
                ))}
              </select>

              {unavailableModelSelected ? (
                <p className="text-destructive text-xs">{m.generation_model_unavailable()}</p>
              ) : null}

              <Label htmlFor="prompt">{m.generation_prompt_label()}</Label>
              <Textarea
                id="prompt"
                value={prompt}
                placeholder={m.generation_prompt_placeholder()}
                onChange={(event) => setPrompt(event.target.value)}
              />

              {supportsNegativePrompt ? (
                <>
                  <Label htmlFor="negative-prompt">{m.generation_negative_label()}</Label>
                  <Textarea
                    id="negative-prompt"
                    value={negativePrompt}
                    placeholder={m.generation_negative_placeholder()}
                    onChange={(event) => setNegativePrompt(event.target.value)}
                  />
                </>
              ) : null}

              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="grid min-w-0 gap-1">
                  <Label htmlFor="ratio">{m.generation_ratio_label()}</Label>
                  <select
                    id="ratio"
                    value={aspectRatio}
                    className="border-input bg-input/30 h-9 w-full min-w-0 rounded-4xl border px-3 text-sm"
                    onChange={(event) => {
                      setAspectRatio(event.target.value as typeof aspectRatio)
                    }}
                  >
                    {ASPECT_RATIOS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid min-w-0 gap-1">
                  <Label htmlFor="resolution">{m.generation_resolution_label()}</Label>
                  <select
                    id="resolution"
                    value={resolutionPreset}
                    className="border-input bg-input/30 h-9 w-full min-w-0 rounded-4xl border px-3 text-sm"
                    onChange={(event) => {
                      setResolutionPreset(event.target.value as typeof resolutionPreset)
                    }}
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </select>
                </div>
              </div>

              <div className="grid min-w-0 gap-1">
                <Label htmlFor="count">{m.generation_outputs_label({ count: String(outputCount) })}</Label>
                <input
                  id="count"
                  type="range"
                  min={1}
                  max={maxOutputs}
                  value={outputCount}
                  className={sliderClassName()}
                  onChange={(event) => {
                    setOutputCount(Number(event.target.value))
                  }}
                />
              </div>

              <Button
                disabled={busy || !modelId || unavailableModelSelected || !prompt.trim()}
                onClick={() => {
                  void onGenerate()
                }}
              >
                {busy
                  ? m.generation_button_busy()
                  : remixOfStepId
                    ? m.generation_button_remix()
                    : m.generation_button()}
              </Button>

              {remixOfStepId ? (
                <div className="bg-muted/60 text-muted-foreground rounded-xl px-3 py-2 text-xs">
                  {m.generation_remix_active({ stepId: remixOfStepId })}{' '}
                  <button
                    type="button"
                    className="text-foreground underline"
                    onClick={() => {
                      setRemixOfStepId(undefined)
                      setRemixOfAssetId(undefined)
                    }}
                  >
                    {m.generation_remix_clear()}
                  </button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{m.references_title()}</CardTitle>
              <CardDescription>{m.references_description()}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div
                className="border-border/70 hover:border-primary/60 bg-muted/20 rounded-2xl border border-dashed p-4"
                onDragOver={(event) => {
                  event.preventDefault()
                }}
                onDrop={(event) => {
                  void onDropReferences(event)
                }}
              >
                <p className="text-sm">{m.references_drop_hint()}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => referenceInputRef.current?.click()}>
                    {m.references_select_files()}
                  </Button>
                  <input
                    ref={referenceInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? [])
                      void onReferenceFiles(files)
                      event.target.value = ''
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  placeholder={m.references_youtube_placeholder()}
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                />
                <Button size="sm" variant="outline" onClick={() => void onImportYoutube()}>
                  {m.references_youtube_import()}
                </Button>
              </div>

              {supportsReferences ? null : (
                <p className="text-muted-foreground text-xs">{m.references_model_unsupported()}</p>
              )}

              <div className="max-h-72 min-w-0 space-y-2 overflow-auto pr-1">
                {referenceAssets.length === 0 ? (
                  <p className="text-muted-foreground rounded-xl border border-dashed border-border/70 p-3 text-sm">
                    {m.references_empty()}
                  </p>
                ) : null}

                {referenceAssets.map((asset) => {
                  const selected = selectedReferenceIds.includes(asset.id)

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`grid w-full min-w-0 grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-2 text-left ${
                        selected
                          ? 'border-primary bg-primary/10'
                          : 'border-border/70 bg-card hover:border-primary/50'
                      }`}
                      onClick={() => {
                        setSelectedReferenceIds((current) =>
                          current.includes(asset.id)
                            ? current.filter((id) => id !== asset.id)
                            : [...current, asset.id],
                        )
                      }}
                    >
                      <div className="h-16 w-20 overflow-hidden rounded-xl">
                        <AssetThumb asset={asset} alt={m.references_title()} />
                      </div>
                      <div className="min-w-0 text-xs">
                        <p className="truncate font-medium">{asset.kind}</p>
                        <p className="text-muted-foreground truncate">{formatDate(asset.createdAt)}</p>
                        <p className="text-muted-foreground truncate">
                          {asset.width}x{asset.height}
                        </p>
                      </div>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedReferenceIds((current) =>
                            current.filter((id) => id !== asset.id),
                          )
                          void removeReferenceImage(asset.id)
                        }}
                      >
                        {m.references_delete()}
                      </Button>
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 p-3">
                <div>
                  <p className="font-medium">{m.personas_title()}</p>
                  <p className="text-muted-foreground text-xs">
                    {m.personas_selected({ count: String(selectedPersonaIds.length) })}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setIsPersonaModalOpen(true)}>
                  {m.personas_open_manager()}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{m.editor_title()}</CardTitle>
              <CardDescription>{m.editor_description()}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button
                variant="outline"
                disabled={!outputAssets.length}
                onClick={() => {
                  const latest = outputAssets[outputAssets.length - 1]
                  openEditorForAsset(latest.id)
                }}
              >
                {m.editor_open()}
              </Button>
              <p className="text-muted-foreground text-sm">{m.editor_no_source()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{m.exports_title()}</CardTitle>
              <CardDescription>{m.exports_description()}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button variant="outline" onClick={() => void exportProjectBatch()}>
                {m.exports_batch({ count: String(outputAssets.length) })}
              </Button>
            </CardContent>
          </Card>

          {quotaState ? (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-destructive">{m.quota_title()}</CardTitle>
                <CardDescription>{quotaState.reason}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCleanupStateVisible((current) => !current)
                    void onLoadCleanup()
                  }}
                >
                  {cleanupStateVisible ? m.quota_close() : m.quota_open()}
                </Button>

                {cleanupStateVisible ? (
                  <div className="max-h-52 space-y-2 overflow-auto pr-1">
                    {cleanupRows.map((row) => (
                      <div
                        key={row.project.id}
                        className="bg-muted/40 flex items-center justify-between rounded-xl px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium">{row.project.name}</p>
                          <p className="text-muted-foreground text-xs">
                            {m.quota_estimated_size({ size: bytesToSize(row.bytes) })}
                          </p>
                        </div>
                        <Button
                          size="xs"
                          variant="destructive"
                          onClick={async () => {
                            await removeProjectAndRefresh(row.project.id)
                            await onLoadCleanup()
                          }}
                        >
                          {m.projects_delete()}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {error ? (
            <Card className="border-destructive/40">
              <CardContent className="text-destructive pt-6 text-sm">{error}</CardContent>
            </Card>
          ) : null}
        </section>

        <section className="min-w-0">
          <Card className="min-h-[80vh]">
            <CardHeader>
              <CardTitle>{m.timeline_title()}</CardTitle>
              <CardDescription>{m.timeline_description()}</CardDescription>
            </CardHeader>
            <CardContent>
              {steps.length === 0 ? (
                <div className="bg-muted/30 text-muted-foreground rounded-2xl p-6 text-sm">
                  {m.timeline_empty()}
                </div>
              ) : (
                <ol className="relative space-y-4 border-l border-dashed pl-5">
                  {steps.map((step) => (
                    <li key={step.id} className="relative">
                      <span className="bg-primary absolute -left-[1.72rem] top-3 h-3 w-3 rounded-full" />

                      {step.type === 'generation' ? (
                        <Card size="sm" className="gap-4">
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">{m.timeline_generation_step()}</CardTitle>
                              <Badge>{formatDate(step.createdAt)}</Badge>
                            </div>
                            <CardDescription>
                              {m.timeline_model_line({
                                model: step.input.modelId,
                                resolution: step.input.resolutionPreset,
                                ratio: step.input.aspectRatio,
                              })}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3 min-w-0 overflow-hidden">
                            <div className="rounded-xl bg-zinc-900/90 p-3 text-xs text-zinc-100">
                              <p className="text-zinc-400">{m.timeline_prompt()}</p>
                              <p className="mt-1 whitespace-pre-wrap">{step.input.prompt}</p>
                            </div>

                            {step.input.negativePrompt ? (
                              <div className="rounded-xl bg-zinc-100 p-3 text-xs text-zinc-900 ring-1 ring-zinc-200">
                                <p className="text-zinc-500">{m.timeline_negative_prompt()}</p>
                                <p className="mt-1 whitespace-pre-wrap">{step.input.negativePrompt}</p>
                              </div>
                            ) : null}

                            <div className="flex min-w-0 flex-wrap gap-2">
                              <span className="text-muted-foreground text-xs">
                                {m.timeline_references_label()}:
                              </span>
                              {step.input.referenceAssetIds.length === 0 ? (
                                <Badge variant="outline">{m.timeline_references_none()}</Badge>
                              ) : (
                                step.input.referenceAssetIds.map((assetId) => {
                                  const missingReferences = missingReferenceIdsByStep.get(step.id)
                                  const isDeleted = missingReferences
                                    ? missingReferences.includes(assetId)
                                    : !assetsMap.has(assetId)
                                  return (
                                    <Badge key={assetId} variant={isDeleted ? 'destructive' : 'outline'}>
                                      {isDeleted
                                        ? m.references_deleted_badge()
                                        : assetId.slice(0, 8)}
                                    </Badge>
                                  )
                                })
                              )}
                            </div>

                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {step.outputs.map((output) => {
                                const asset = assetsMap.get(output.assetId)
                                if (!asset) {
                                  return null
                                }

                                return (
                                  <div
                                    key={output.assetId}
                                    className="border-border/60 overflow-hidden rounded-2xl border"
                                  >
                                    <div className="h-44 w-full overflow-hidden">
                                      <AssetThumb asset={asset} alt={m.timeline_output()} />
                                    </div>
                                    <div className="space-y-2 p-3">
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          onClick={() => onRemixFrom(step, output.assetId)}
                                        >
                                          {m.timeline_action_remix()}
                                        </Button>
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          onClick={() => openEditorForAsset(output.assetId)}
                                        >
                                          {m.timeline_action_edit()}
                                        </Button>
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          onClick={() => void exportSingleAsset(output.assetId)}
                                        >
                                          {m.timeline_action_jpg()}
                                        </Button>
                                      </div>
                                      <p className="text-muted-foreground text-xs">
                                        {asset.width}x{asset.height} · {asset.mimeType}
                                      </p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            {settings.nerdMode ? (
                              <div className="bg-muted/30 rounded-xl p-3 text-xs">
                                <p>{m.timeline_nerd_step_id({ id: step.id })}</p>
                                <p>{m.timeline_nerd_status({ status: step.status })}</p>
                                <p>
                                  {m.timeline_nerd_references({
                                    count: String(step.input.referenceAssetIds.length),
                                  })}
                                </p>
                                <p>
                                  {m.timeline_nerd_personas({
                                    count: String(step.input.personaIds.length),
                                  })}
                                </p>
                                <p>
                                  {m.timeline_nerd_requested_outputs({
                                    count: String(step.input.outputCount),
                                  })}
                                </p>
                                {step.trace?.requestAt ? (
                                  <p>
                                    {m.timeline_nerd_request_started({
                                      date: formatDate(step.trace.requestAt),
                                    })}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      ) : (
                        <Card size="sm" className="gap-4">
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">{m.timeline_edit_step()}</CardTitle>
                              <Badge>{formatDate(step.createdAt)}</Badge>
                            </div>
                            <CardDescription>{m.timeline_edit_description()}</CardDescription>
                          </CardHeader>
                          <CardContent className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <p className="text-xs font-medium">{m.timeline_source()}</p>
                              <div className="h-40 overflow-hidden rounded-xl">
                                {assetsMap.get(step.sourceAssetId) ? (
                                  <AssetThumb
                                    asset={assetsMap.get(step.sourceAssetId) as OutputAsset}
                                    alt={m.timeline_source()}
                                  />
                                ) : (
                                  <div className="bg-muted text-muted-foreground flex h-full items-center justify-center rounded-xl text-xs">
                                    {m.timeline_missing_source()}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs font-medium">{m.timeline_output()}</p>
                              <div className="h-40 overflow-hidden rounded-xl">
                                {assetsMap.get(step.outputAssetId) ? (
                                  <AssetThumb
                                    asset={assetsMap.get(step.outputAssetId) as OutputAsset}
                                    alt={m.timeline_output()}
                                  />
                                ) : (
                                  <div className="bg-muted text-muted-foreground flex h-full items-center justify-center rounded-xl text-xs">
                                    {m.timeline_missing_output()}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() => void exportSingleAsset(step.outputAssetId)}
                                >
                                  {m.timeline_export_jpg()}
                                </Button>
                              </div>
                            </div>
                            {settings.nerdMode ? (
                              <div className="bg-muted/30 col-span-full rounded-xl p-3 text-xs">
                                <p>{m.timeline_nerd_step_id({ id: step.id })}</p>
                                <p>{m.timeline_nerd_rotate({ value: String(step.operations.rotate) })}</p>
                                <p>
                                  {m.timeline_nerd_brightness({
                                    value: String(step.operations.brightness),
                                  })}
                                </p>
                                <p>
                                  {m.timeline_nerd_contrast({
                                    value: String(step.operations.contrast),
                                  })}
                                </p>
                                <p>
                                  {m.timeline_nerd_saturation({
                                    value: String(step.operations.saturation),
                                  })}
                                </p>
                                <p>{m.timeline_nerd_blur({ value: String(step.operations.blur) })}</p>
                                <p>
                                  {m.timeline_nerd_sharpen({
                                    value: String(step.operations.sharpen),
                                  })}
                                </p>
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <ImageEditorModal
        open={isEditorOpen}
        sourceAsset={selectedEditorAsset}
        initialOperations={editorOperations}
        busy={busy}
        onCancel={() => {
          setIsEditorOpen(false)
          setEditorSourceAssetId(null)
          setEditorOperations(DEFAULT_EDITOR_OPS)
        }}
        onApply={async (operations) => {
          if (!editorSourceAssetId) {
            return
          }

          await createEditStep(editorSourceAssetId, operations)
          setIsEditorOpen(false)
          setEditorSourceAssetId(null)
          setEditorOperations(DEFAULT_EDITOR_OPS)
        }}
      />

      <PersonaManagerModal
        open={isPersonaModalOpen}
        personas={personas}
        assetsMap={assetsMap}
        selectedPersonaIds={selectedPersonaIds}
        onClose={() => setIsPersonaModalOpen(false)}
        onCreatePersona={async (name) => {
          await createPersona(name)
        }}
        onRenamePersona={async (personaId, name) => {
          await renamePersonaItem(personaId, name)
        }}
        onDeletePersona={async (personaId) => {
          setSelectedPersonaIds((current) => current.filter((id) => id !== personaId))
          await removePersona(personaId)
        }}
        onAddPersonaImages={async (personaId, files) => {
          await addPersonaImages(personaId, files)
        }}
        onRemovePersonaImage={async (assetId) => {
          await removePersonaImage(assetId)
        }}
        onToggleSelectedPersona={(personaId) => {
          setSelectedPersonaIds((current) =>
            current.includes(personaId)
              ? current.filter((id) => id !== personaId)
              : [...current, personaId],
          )
        }}
      />
    </main>
  )
}

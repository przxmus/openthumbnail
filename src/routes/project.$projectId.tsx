import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  
  
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type {ClipboardEvent as ReactClipboardEvent, DragEvent as ReactDragEvent} from 'react';

import type { EditOperations, ModelCapability, OutputAsset, TimelineStep } from '@/types/workshop'
import { AssetThumb } from '@/components/workshop/asset-thumb'
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
  return 'accent-primary h-2 w-full rounded-full'
}

function ProjectWorkshopPage() {
  const navigate = useNavigate()
  const params = Route.useParams()
  const backupInputRef = useRef<HTMLInputElement | null>(null)
  const referenceInputRef = useRef<HTMLInputElement | null>(null)

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
    removePersona,
    generateStep,
    createEditStep,
    exportSingleAsset,
    exportProjectBatch,
    exportBackup,
    importBackup,
    cleanupCandidates,
    removeProjectAndRefresh,
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
  const [personaName, setPersonaName] = useState('')
  const [editorSourceAssetId, setEditorSourceAssetId] = useState<string | null>(null)
  const [editorOperations, setEditorOperations] =
    useState<EditOperations>(DEFAULT_EDITOR_OPS)
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

    setAspectRatio(project.defaultAspectRatio)
    setResolutionPreset(project.defaultResolution)

    const fallbackModel =
      project.defaultModel ?? settings.lastUsedModel ?? models.find((entry) => entry.availability === 'available')?.id

    if (fallbackModel) {
      setModelId(fallbackModel)
    }

    const draft = loadPromptDraft(project.id)
    setPrompt(draft.prompt)
    setNegativePrompt(draft.negativePrompt)
  }, [models, project, settings.lastUsedModel])

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

  const unavailableModelSelected = modelCapability?.availability === 'unavailable'

  const onReferenceFiles = async (files: Array<File>) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) {
      return
    }

    await uploadReferenceFiles(imageFiles)
  }

  const onDropReferences = async (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files)
    await onReferenceFiles(files)
  }

  const onPasteReferences = async (event: ReactClipboardEvent<HTMLElement>) => {
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
    if (!project) {
      return
    }

    if (!modelId) {
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

  const onCreatePersona = async () => {
    await createPersona(personaName, selectedReferenceIds)
    setPersonaName('')
  }

  const onStartEdit = (assetId: string) => {
    setEditorSourceAssetId(assetId)
    setEditorOperations(DEFAULT_EDITOR_OPS)
  }

  const onApplyEdit = async () => {
    if (!editorSourceAssetId) {
      return
    }

    await createEditStep(editorSourceAssetId, editorOperations)
    setEditorSourceAssetId(null)
    setEditorOperations(DEFAULT_EDITOR_OPS)
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
    setSelectedReferenceIds(
      Array.from(new Set([outputAssetId, ...step.input.referenceAssetIds])),
    )
    setSelectedPersonaIds(step.input.personaIds)
    setRemixOfStepId(step.id)
    setRemixOfAssetId(outputAssetId)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading workshop...</p>
      </main>
    )
  }

  if (!project) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Card>
          <CardHeader>
            <CardTitle>Project not found</CardTitle>
            <CardDescription>
              The selected project does not exist in local storage.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => navigate({ to: '/' })}>Back to projects</Button>
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
      <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 py-6 md:px-8 xl:grid-cols-[420px_1fr]">
        <section className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                    Project
                  </p>
                  <CardTitle className="mt-1 text-xl">{project.name}</CardTitle>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate({ to: '/' })}>
                  Projects
                </Button>
              </div>
              <CardDescription>
                Updated {formatDate(project.updatedAt)} · local-only timeline workspace
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={project.name}
                onChange={async (event) => {
                  await updateProjectDefaults({ name: event.target.value })
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => void exportBackup()}>
                  Backup ZIP
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => backupInputRef.current?.click()}
                >
                  Restore ZIP
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
                Delete project
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Generation</CardTitle>
              <CardDescription>
                Model-first flow. Fields unlock depending on model capabilities.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Label htmlFor="model">Model</Label>
              <select
                id="model"
                value={modelId}
                className="border-input bg-input/30 h-9 rounded-4xl border px-3 text-sm"
                onChange={(event) => setModelId(event.target.value)}
              >
                <option value="">Select model</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                    {model.availability === 'unavailable' ? ' (unavailable)' : ''}
                  </option>
                ))}
              </select>

              {unavailableModelSelected ? (
                <p className="text-destructive text-xs">
                  This model is unavailable. Pick another model before generating.
                </p>
              ) : null}

              <Label htmlFor="prompt">Prompt</Label>
              <Textarea
                id="prompt"
                value={prompt}
                placeholder="Describe the thumbnail you want to generate"
                onChange={(event) => setPrompt(event.target.value)}
              />

              {supportsNegativePrompt ? (
                <>
                  <Label htmlFor="negative-prompt">Negative prompt</Label>
                  <Textarea
                    id="negative-prompt"
                    value={negativePrompt}
                    placeholder="What must not appear in the thumbnail"
                    onChange={(event) => setNegativePrompt(event.target.value)}
                  />
                </>
              ) : null}

              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1">
                  <Label htmlFor="ratio">Aspect ratio</Label>
                  <select
                    id="ratio"
                    value={aspectRatio}
                    className="border-input bg-input/30 h-9 rounded-4xl border px-3 text-sm"
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
                <div className="grid gap-1">
                  <Label htmlFor="resolution">Resolution</Label>
                  <select
                    id="resolution"
                    value={resolutionPreset}
                    className="border-input bg-input/30 h-9 rounded-4xl border px-3 text-sm"
                    onChange={(event) => {
                      setResolutionPreset(event.target.value as typeof resolutionPreset)
                    }}
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="count">Outputs ({outputCount})</Label>
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
              </div>

              <Button
                disabled={busy || !modelId || unavailableModelSelected || !prompt.trim()}
                onClick={() => {
                  void onGenerate()
                }}
              >
                {busy ? 'Generating...' : remixOfStepId ? 'Generate Remix' : 'Generate'}
              </Button>

              {remixOfStepId ? (
                <div className="bg-muted/60 text-muted-foreground rounded-xl px-3 py-2 text-xs">
                  Remix mode active from step {remixOfStepId}.{' '}
                  <button
                    type="button"
                    className="text-foreground underline"
                    onClick={() => {
                      setRemixOfStepId(undefined)
                      setRemixOfAssetId(undefined)
                    }}
                  >
                    Clear remix
                  </button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>References & Personas</CardTitle>
              <CardDescription>
                Drag-drop, file picker, or clipboard paste. YouTube import adds highest thumbnail quality.
              </CardDescription>
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
                <p className="text-sm">Drop reference images here or paste from clipboard.</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => referenceInputRef.current?.click()}
                  >
                    Select files
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

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  placeholder="YouTube URL (watch / youtu.be / shorts)"
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                />
                <Button size="sm" variant="outline" onClick={() => void onImportYoutube()}>
                  Import thumbnail
                </Button>
              </div>

              {supportsReferences ? null : (
                <p className="text-muted-foreground text-xs">
                  Current model does not support reference images. You can still manage library assets.
                </p>
              )}

              <div className="max-h-64 space-y-2 overflow-auto pr-1">
                {referenceAssets.map((asset) => {
                  const selected = selectedReferenceIds.includes(asset.id)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`ring-border grid w-full grid-cols-[84px_1fr] gap-3 rounded-2xl p-2 text-left ring-1 ${
                        selected ? 'bg-primary/8 ring-primary' : 'bg-card'
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
                        <AssetThumb asset={asset} alt="reference" />
                      </div>
                      <div className="flex flex-col justify-center text-xs">
                        <p className="font-medium">{asset.kind}</p>
                        <p className="text-muted-foreground">{formatDate(asset.createdAt)}</p>
                        <p className="text-muted-foreground">{asset.width}x{asset.height}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="border-border/60 rounded-2xl border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Input
                    placeholder="Persona name"
                    value={personaName}
                    onChange={(event) => setPersonaName(event.target.value)}
                  />
                  <Button size="sm" variant="outline" onClick={() => void onCreatePersona()}>
                    Save persona
                  </Button>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  Persona uses currently selected references (max 4).
                </p>
              </div>

              <div className="space-y-2">
                {personas.map((persona) => {
                  const selected = selectedPersonaIds.includes(persona.id)
                  return (
                    <div
                      key={persona.id}
                      className={`ring-border flex items-center justify-between rounded-xl px-3 py-2 ring-1 ${
                        selected ? 'bg-primary/8 ring-primary' : 'bg-card'
                      }`}
                    >
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => {
                          setSelectedPersonaIds((current) =>
                            current.includes(persona.id)
                              ? current.filter((id) => id !== persona.id)
                              : [...current, persona.id],
                          )
                        }}
                      >
                        <p className="text-sm font-medium">{persona.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {persona.referenceAssetIds.length} references
                        </p>
                      </button>
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => {
                          void removePersona(persona.id)
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Editor</CardTitle>
              <CardDescription>
                Apply basic crop and tone adjustments as timeline edit steps.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {selectedEditorAsset ? (
                <div className="h-36 overflow-hidden rounded-xl">
                  <AssetThumb asset={selectedEditorAsset} alt="editing source" />
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Select “Edit” on any generated output in timeline.
                </p>
              )}

              <div className="grid gap-3">
                <Label>Crop X ({editorOperations.cropX}%)</Label>
                <input
                  type="range"
                  min={0}
                  max={99}
                  value={editorOperations.cropX}
                  className={sliderClassName()}
                  onChange={(event) =>
                    setEditorOperations((current) => ({
                      ...current,
                      cropX: Number(event.target.value),
                    }))
                  }
                />
                <Label>Crop Y ({editorOperations.cropY}%)</Label>
                <input
                  type="range"
                  min={0}
                  max={99}
                  value={editorOperations.cropY}
                  className={sliderClassName()}
                  onChange={(event) =>
                    setEditorOperations((current) => ({
                      ...current,
                      cropY: Number(event.target.value),
                    }))
                  }
                />
                <Label>Crop Width ({editorOperations.cropWidth}%)</Label>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={editorOperations.cropWidth}
                  className={sliderClassName()}
                  onChange={(event) =>
                    setEditorOperations((current) => ({
                      ...current,
                      cropWidth: Number(event.target.value),
                    }))
                  }
                />
                <Label>Crop Height ({editorOperations.cropHeight}%)</Label>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={editorOperations.cropHeight}
                  className={sliderClassName()}
                  onChange={(event) =>
                    setEditorOperations((current) => ({
                      ...current,
                      cropHeight: Number(event.target.value),
                    }))
                  }
                />
                <Label>Rotate ({editorOperations.rotate}°)</Label>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={editorOperations.rotate}
                  className={sliderClassName()}
                  onChange={(event) =>
                    setEditorOperations((current) => ({
                      ...current,
                      rotate: Number(event.target.value),
                    }))
                  }
                />
                <Label>Brightness ({editorOperations.brightness}%)</Label>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={editorOperations.brightness}
                  className={sliderClassName()}
                  onChange={(event) =>
                    setEditorOperations((current) => ({
                      ...current,
                      brightness: Number(event.target.value),
                    }))
                  }
                />
                <Label>Contrast ({editorOperations.contrast}%)</Label>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={editorOperations.contrast}
                  className={sliderClassName()}
                  onChange={(event) =>
                    setEditorOperations((current) => ({
                      ...current,
                      contrast: Number(event.target.value),
                    }))
                  }
                />
                <Label>Saturation ({editorOperations.saturation}%)</Label>
                <input
                  type="range"
                  min={0}
                  max={300}
                  value={editorOperations.saturation}
                  className={sliderClassName()}
                  onChange={(event) =>
                    setEditorOperations((current) => ({
                      ...current,
                      saturation: Number(event.target.value),
                    }))
                  }
                />
                <Label>Blur ({editorOperations.blur}px)</Label>
                <input
                  type="range"
                  min={0}
                  max={12}
                  value={editorOperations.blur}
                  className={sliderClassName()}
                  onChange={(event) =>
                    setEditorOperations((current) => ({
                      ...current,
                      blur: Number(event.target.value),
                    }))
                  }
                />
                <Label>Sharpen ({editorOperations.sharpen})</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={editorOperations.sharpen}
                  className={sliderClassName()}
                  onChange={(event) =>
                    setEditorOperations((current) => ({
                      ...current,
                      sharpen: Number(event.target.value),
                    }))
                  }
                />
              </div>

              <Button
                disabled={!selectedEditorAsset || busy}
                onClick={() => {
                  void onApplyEdit()
                }}
              >
                Apply edit step
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exports</CardTitle>
              <CardDescription>Final format is JPG; batch exports as ZIP.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button variant="outline" onClick={() => void exportProjectBatch()}>
                Export batch ZIP ({outputAssets.length})
              </Button>
            </CardContent>
          </Card>

          {quotaState ? (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-destructive">Storage quota exceeded</CardTitle>
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
                  {cleanupStateVisible ? 'Hide cleanup wizard' : 'Open cleanup wizard'}
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
                            Estimated size {bytesToSize(row.bytes)}
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
                          Delete
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

        <section>
          <Card className="min-h-[80vh]">
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>
                Prompt/output/edit history for this project. Top is oldest step, newest at bottom.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {steps.length === 0 ? (
                <div className="bg-muted/30 text-muted-foreground rounded-2xl p-6 text-sm">
                  Timeline is empty. Generate your first thumbnail.
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
                              <CardTitle className="text-base">Generation step</CardTitle>
                              <Badge>{formatDate(step.createdAt)}</Badge>
                            </div>
                            <CardDescription>
                              Model {step.input.modelId} · {step.input.resolutionPreset} ·{' '}
                              {step.input.aspectRatio}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="rounded-xl bg-zinc-900/90 p-3 text-xs text-zinc-100">
                              <p className="text-zinc-400">Prompt</p>
                              <p className="mt-1 whitespace-pre-wrap">{step.input.prompt}</p>
                            </div>

                            {step.input.negativePrompt ? (
                              <div className="rounded-xl bg-zinc-100 p-3 text-xs text-zinc-900 ring-1 ring-zinc-200">
                                <p className="text-zinc-500">Negative prompt</p>
                                <p className="mt-1 whitespace-pre-wrap">{step.input.negativePrompt}</p>
                              </div>
                            ) : null}

                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {step.outputs.map((output) => {
                                const asset = assetsMap.get(output.assetId)
                                if (!asset) {
                                  return null
                                }

                                return (
                                  <div
                                    key={output.assetId}
                                    className="ring-border/60 overflow-hidden rounded-2xl ring-1"
                                  >
                                    <div className="h-44 w-full overflow-hidden">
                                      <AssetThumb asset={asset} alt="generated thumbnail" />
                                    </div>
                                    <div className="space-y-2 p-3">
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          onClick={() => onRemixFrom(step, output.assetId)}
                                        >
                                          Remix
                                        </Button>
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          onClick={() => onStartEdit(output.assetId)}
                                        >
                                          Edit
                                        </Button>
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          onClick={() => void exportSingleAsset(output.assetId)}
                                        >
                                          JPG
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
                                <p>Step id: {step.id}</p>
                                <p>Status: {step.status}</p>
                                <p>References: {step.input.referenceAssetIds.length}</p>
                                <p>Personas: {step.input.personaIds.length}</p>
                                <p>Requested outputs: {step.input.outputCount}</p>
                                {step.trace?.requestAt ? (
                                  <p>Request started: {formatDate(step.trace.requestAt)}</p>
                                ) : null}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      ) : (
                        <Card size="sm" className="gap-4">
                          <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base">Edit step</CardTitle>
                              <Badge>{formatDate(step.createdAt)}</Badge>
                            </div>
                            <CardDescription>
                              Crop / rotate / color adjustments saved as separate step.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <p className="text-xs font-medium">Source</p>
                              <div className="h-40 overflow-hidden rounded-xl">
                                {assetsMap.get(step.sourceAssetId) ? (
                                  <AssetThumb
                                    asset={assetsMap.get(step.sourceAssetId) as OutputAsset}
                                    alt="source image"
                                  />
                                ) : (
                                  <div className="bg-muted text-muted-foreground flex h-full items-center justify-center rounded-xl text-xs">
                                    Missing source
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs font-medium">Output</p>
                              <div className="h-40 overflow-hidden rounded-xl">
                                {assetsMap.get(step.outputAssetId) ? (
                                  <AssetThumb
                                    asset={assetsMap.get(step.outputAssetId) as OutputAsset}
                                    alt="edited image"
                                  />
                                ) : (
                                  <div className="bg-muted text-muted-foreground flex h-full items-center justify-center rounded-xl text-xs">
                                    Missing output
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() => void exportSingleAsset(step.outputAssetId)}
                                >
                                  Export JPG
                                </Button>
                              </div>
                            </div>
                            {settings.nerdMode ? (
                              <div className="bg-muted/30 col-span-full rounded-xl p-3 text-xs">
                                <p>Step id: {step.id}</p>
                                <p>Rotate: {step.operations.rotate}</p>
                                <p>Brightness: {step.operations.brightness}</p>
                                <p>Contrast: {step.operations.contrast}</p>
                                <p>Saturation: {step.operations.saturation}</p>
                                <p>Blur: {step.operations.blur}</p>
                                <p>Sharpen: {step.operations.sharpen}</p>
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
    </main>
  )
}

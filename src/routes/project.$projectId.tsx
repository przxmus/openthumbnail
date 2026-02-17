import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent } from 'react'
import type {
  EditOperations,
  GenerationInput,
  GenerationResultStep,
  LegacyGenerationStep,
  LightboxContext,
  ModelCapability,
  OutputAsset,
  PromptStep,
  TimelineStep,
} from '@/types/workshop'

import { m } from '@/paraglide/messages.js'
import { AssetThumb } from '@/components/workshop/asset-thumb'
import { ImageEditorModal } from '@/components/workshop/image-editor-modal'
import { ImageLightboxModal } from '@/components/workshop/image-lightbox-modal'
import { PersonaManagerModal } from '@/components/workshop/persona-manager-modal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  loadPromptDraft,
  loadTimelineUiState,
  savePromptDraft,
  saveTimelineUiState,
} from '@/lib/storage/settings'

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
  return 'range-input h-2.5 w-full min-w-0'
}

interface GenerationSource {
  sourceStepId: string
  input: GenerationInput
  outputs: LegacyGenerationStep['outputs']
  status: GenerationResultStep['status']
  trace?: GenerationResultStep['trace']
  createdAt: number
}

interface PromptTimelineItem {
  id: string
  type: 'prompt'
  sourceStepId: string
  createdAt: number
  input: GenerationInput
  sortGroupId: string
  sortOrder: number
}

interface GenerationTimelineItem {
  id: string
  type: 'generation'
  createdAt: number
  input: GenerationInput
  status: GenerationResultStep['status']
  trace?: GenerationResultStep['trace']
  outputs: LegacyGenerationStep['outputs']
  sourceStepId: string
  sortGroupId: string
  sortOrder: number
}

interface EditTimelineItem {
  id: string
  type: 'edit'
  createdAt: number
  step: Extract<TimelineStep, { type: 'edit' }>
  sortGroupId: string
  sortOrder: number
}

type TimelineItem = PromptTimelineItem | GenerationTimelineItem | EditTimelineItem

interface StepUndoEntry {
  step: TimelineStep
  assets: Array<OutputAsset>
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
    removeTimelineStep,
    restoreTimelineStep,
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
  const [collapsedStepIds, setCollapsedStepIds] = useState<Array<string>>([])
  const [lightboxContext, setLightboxContext] = useState<LightboxContext | null>(null)
  const [cleanupStateVisible, setCleanupStateVisible] = useState(false)
  const [cleanupRows, setCleanupRows] = useState<
    Array<{ project: { id: string; name: string }; bytes: number }>
  >([])
  const [projectIdPendingDelete, setProjectIdPendingDelete] = useState<string | null>(null)
  const [timelineStepPendingDelete, setTimelineStepPendingDelete] = useState<{
    id: string
    label: string
  } | null>(null)
  const [undoStack, setUndoStack] = useState<Array<StepUndoEntry>>([])
  const [redoStack, setRedoStack] = useState<Array<StepUndoEntry>>([])
  const [historyBusy, setHistoryBusy] = useState(false)
  const [remixSnapshot, setRemixSnapshot] = useState<{
    modelId: string
    prompt: string
    negativePrompt: string
    aspectRatio: '1:1' | '4:3' | '16:9' | '9:16'
    resolutionPreset: '720p' | '1080p'
    outputCount: number
    selectedReferenceIds: Array<string>
    selectedPersonaIds: Array<string>
  } | null>(null)

  const modelCapability = useMemo(
    () => getModelCapability(models, modelId),
    [modelId, models],
  )
  const stepById = useMemo(() => new Map(steps.map((step) => [step.id, step])), [steps])

  const supportsNegativePrompt = modelCapability?.supportsNegativePrompt ?? false
  const supportsReferences = modelCapability?.supportsReferences ?? false
  const maxOutputs = MAX_OUTPUTS_UI

  const promptStepsById = useMemo(
    () =>
      new Map(
        steps
          .filter((step): step is PromptStep => step.type === 'prompt')
          .map((step) => [step.id, step]),
      ),
    [steps],
  )

  const generationSources = useMemo(() => {
    const rows: Array<GenerationSource> = []
    for (const step of steps) {
      if (step.type === 'generation') {
        rows.push({
          sourceStepId: step.id,
          input: step.input,
          outputs: step.outputs,
          status: step.status,
          trace: step.trace,
          createdAt: step.createdAt,
        })
        continue
      }

      if (step.type === 'generation-result') {
        const promptStep = promptStepsById.get(step.promptStepId)
        const resolvedInput = promptStep?.input ?? step.inputSnapshot
        if (!resolvedInput) {
          continue
        }

        rows.push({
          sourceStepId: step.id,
          input: resolvedInput,
          outputs: step.outputs,
          status: step.status,
          trace: step.trace,
          createdAt: step.createdAt,
        })
      }
    }

    return rows
  }, [promptStepsById, steps])

  const generationSourceByAssetId = useMemo(() => {
    const map = new Map<string, GenerationSource>()
    for (const generation of generationSources) {
      for (const output of generation.outputs) {
        map.set(output.assetId, generation)
      }
    }

    return map
  }, [generationSources])

  const timelineItems = useMemo(() => {
    const items: Array<TimelineItem> = []

    for (const step of steps) {
      if (step.type === 'edit') {
        items.push({
          id: step.id,
          type: 'edit',
          createdAt: step.createdAt,
          step,
          sortGroupId: step.id,
          sortOrder: 2,
        })
        continue
      }

      if (step.type === 'prompt') {
        items.push({
          id: step.id,
          type: 'prompt',
          sourceStepId: step.id,
          createdAt: step.createdAt,
          input: step.input,
          sortGroupId: step.id,
          sortOrder: 0,
        })
        continue
      }

      if (step.type === 'generation-result') {
        const promptStep = promptStepsById.get(step.promptStepId)
        const resolvedInput = promptStep?.input ?? step.inputSnapshot
        if (!resolvedInput) {
          continue
        }

        items.push({
          id: step.id,
          type: 'generation',
          createdAt: step.createdAt,
          input: resolvedInput,
          status: step.status,
          trace: step.trace,
          outputs: step.outputs,
          sourceStepId: step.id,
          sortGroupId: step.promptStepId,
          sortOrder: 1,
        })
        continue
      }

      if (step.type === 'generation') {
        items.push({
          id: `${step.id}:prompt`,
          type: 'prompt',
          sourceStepId: step.id,
          createdAt: step.createdAt,
          input: step.input,
          sortGroupId: step.id,
          sortOrder: 0,
        })
        items.push({
          id: `${step.id}:generation`,
          type: 'generation',
          createdAt: step.createdAt + 1,
          input: step.input,
          status: step.status,
          trace: step.trace,
          outputs: step.outputs,
          sourceStepId: step.id,
          sortGroupId: step.id,
          sortOrder: 1,
        })
      }
    }

    return items.sort((a, b) => {
      const createdAtDiff = a.createdAt - b.createdAt
      if (createdAtDiff !== 0) {
        return createdAtDiff
      }

      if (a.sortGroupId === b.sortGroupId) {
        return a.sortOrder - b.sortOrder
      }

      return a.sortGroupId.localeCompare(b.sortGroupId)
    })
  }, [promptStepsById, steps])

  const selectedEditorAsset = editorSourceAssetId
    ? assetsMap.get(editorSourceAssetId) ?? null
    : null
  const remixPreviewAsset = remixOfAssetId ? assetsMap.get(remixOfAssetId) ?? null : null
  const selectedPersonaNames = useMemo(
    () =>
      selectedPersonaIds
        .map((personaId) => personas.find((persona) => persona.id === personaId)?.name)
        .filter((name): name is string => Boolean(name)),
    [personas, selectedPersonaIds],
  )
  const displayedPersonaNames = selectedPersonaNames.slice(0, 2)
  const personaOverflowCount = Math.max(0, selectedPersonaNames.length - displayedPersonaNames.length)
  const lightboxGalleryItems = useMemo(() => {
    if (!lightboxContext) {
      return []
    }

    return lightboxContext.items
      .map((item) => {
        const asset = assetsMap.get(item.assetId)
        if (!asset) {
          return null
        }

        return {
          asset,
          label: item.label,
        }
      })
      .filter((item): item is { asset: OutputAsset; label: string } => Boolean(item))
  }, [assetsMap, lightboxContext])

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
    setCollapsedStepIds(loadTimelineUiState(project.id).collapsedStepIds)
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
    if (!project) {
      return
    }

    setCollapsedStepIds((current) => {
      const stepIds = new Set(timelineItems.map((step) => step.id))
      const next = current.filter((id) => stepIds.has(id))
      const existing = new Set(next)

      for (const step of timelineItems) {
        if (!existing.has(step.id)) {
          next.push(step.id)
        }
      }

      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current
      }

      return next
    })
  }, [project, timelineItems])

  useEffect(() => {
    if (!project) {
      return
    }

    saveTimelineUiState(project.id, {
      collapsedStepIds,
    })
  }, [collapsedStepIds, project])

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
    setRemixSnapshot(null)
  }

  const onImportYoutube = async () => {
    await importYoutubeThumbnail(youtubeUrl)
    setYoutubeUrl('')
  }

  const onLoadCleanup = async () => {
    const rows = await cleanupCandidates()
    setCleanupRows(rows.map((entry) => ({ project: entry.project, bytes: entry.bytes })))
  }

  const openLightbox = (context: LightboxContext) => {
    if (!context.items.length) {
      return
    }

    setLightboxContext(context)
  }

  const toggleStepCollapsed = (stepId: string) => {
    setCollapsedStepIds((current) =>
      current.includes(stepId)
        ? current.filter((id) => id !== stepId)
        : [...current, stepId],
    )
  }

  const onCopyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // no-op: clipboard may be unavailable in some contexts
    }
  }

  const onReusePrompt = (input: GenerationInput) => {
    setModelId(input.modelId)
    setPrompt(input.prompt)
    setNegativePrompt(input.negativePrompt ?? '')
    setAspectRatio(input.aspectRatio)
    setResolutionPreset(input.resolutionPreset)
    setOutputCount(input.outputCount)
    setSelectedReferenceIds(input.referenceAssetIds)
    setSelectedPersonaIds(input.personaIds)
    setRemixOfStepId(undefined)
    setRemixOfAssetId(undefined)
    setRemixSnapshot(null)
  }

  const onRemixFrom = (generation: GenerationSource, outputAssetId: string) => {
    setRemixSnapshot((current) =>
      current ?? {
        modelId,
        prompt,
        negativePrompt,
        aspectRatio,
        resolutionPreset,
        outputCount,
        selectedReferenceIds,
        selectedPersonaIds,
      },
    )

    setModelId(generation.input.modelId)
    setPrompt('')
    setNegativePrompt('')
    setAspectRatio(generation.input.aspectRatio)
    setResolutionPreset(generation.input.resolutionPreset)
    setOutputCount(generation.input.outputCount)
    setSelectedPersonaIds(generation.input.personaIds)
    setSelectedReferenceIds(
      Array.from(new Set([outputAssetId, ...generation.input.referenceAssetIds])),
    )
    setRemixOfStepId(generation.sourceStepId)
    setRemixOfAssetId(outputAssetId)
  }

  const onRemixFromAsset = (outputAssetId: string) => {
    setRemixSnapshot((current) =>
      current ?? {
        modelId,
        prompt,
        negativePrompt,
        aspectRatio,
        resolutionPreset,
        outputCount,
        selectedReferenceIds,
        selectedPersonaIds,
      },
    )

    const generation = generationSourceByAssetId.get(outputAssetId)
    if (generation) {
      setModelId(generation.input.modelId)
      setPrompt('')
      setNegativePrompt('')
      setAspectRatio(generation.input.aspectRatio)
      setResolutionPreset(generation.input.resolutionPreset)
      setOutputCount(generation.input.outputCount)
      setSelectedPersonaIds(generation.input.personaIds)
      setSelectedReferenceIds(
        Array.from(new Set([outputAssetId, ...generation.input.referenceAssetIds])),
      )
      setRemixOfStepId(generation.sourceStepId)
      setRemixOfAssetId(outputAssetId)
      return
    }

    setSelectedReferenceIds((current) =>
      current.includes(outputAssetId) ? current : [outputAssetId, ...current],
    )
    setRemixOfStepId(undefined)
    setRemixOfAssetId(outputAssetId)
  }

  const openEditorForAsset = (assetId: string) => {
    setEditorSourceAssetId(assetId)
    setEditorOperations(DEFAULT_EDITOR_OPS)
    setIsEditorOpen(true)
  }

  const buildUndoEntry = useCallback(
    (sourceStepId: string): StepUndoEntry | null => {
      const step = stepById.get(sourceStepId)
      if (!step) {
        return null
      }

      const assets: Array<OutputAsset> = []
      if (step.type === 'generation' || step.type === 'generation-result') {
        for (const output of step.outputs) {
          const asset = assetsMap.get(output.assetId)
          if (asset?.scope === 'project') {
            assets.push(asset)
          }
        }
      } else if (step.type === 'edit') {
        const asset = assetsMap.get(step.outputAssetId)
        if (asset?.scope === 'project') {
          assets.push(asset)
        }
      }

      return { step, assets }
    },
    [assetsMap, stepById],
  )

  const onRequestDeleteTimelineStep = (sourceStepId: string, label: string) => {
    setTimelineStepPendingDelete({
      id: sourceStepId,
      label,
    })
  }

  const onConfirmDeleteTimelineStep = async () => {
    if (!timelineStepPendingDelete) {
      return
    }

    const snapshot = buildUndoEntry(timelineStepPendingDelete.id)
    if (!snapshot) {
      setTimelineStepPendingDelete(null)
      return
    }

    setHistoryBusy(true)
    try {
      await removeTimelineStep(timelineStepPendingDelete.id)
      setUndoStack((current) => [...current, snapshot])
      setRedoStack([])
    } finally {
      setTimelineStepPendingDelete(null)
      setHistoryBusy(false)
    }
  }

  const onUndo = useCallback(async () => {
    if (historyBusy) {
      return
    }

    let entry: StepUndoEntry | null = null
    setUndoStack((current) => {
      if (!current.length) {
        return current
      }

      entry = current[current.length - 1]
      return current.slice(0, -1)
    })

    if (!entry) {
      return
    }

    setHistoryBusy(true)
    try {
      await restoreTimelineStep(entry)
      setRedoStack((current) => [...current, entry as StepUndoEntry])
    } finally {
      setHistoryBusy(false)
    }
  }, [historyBusy, restoreTimelineStep])

  const onRedo = useCallback(async () => {
    if (historyBusy) {
      return
    }

    let entry: StepUndoEntry | null = null
    setRedoStack((current) => {
      if (!current.length) {
        return current
      }

      entry = current[current.length - 1]
      return current.slice(0, -1)
    })

    if (!entry) {
      return
    }

    setHistoryBusy(true)
    try {
      await removeTimelineStep(entry.step.id)
      setUndoStack((current) => [...current, entry as StepUndoEntry])
    } finally {
      setHistoryBusy(false)
    }
  }, [historyBusy, removeTimelineStep])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      const isMetaOrCtrl = event.metaKey || event.ctrlKey
      if (!isMetaOrCtrl) {
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          void onRedo()
        } else {
          void onUndo()
        }
        return
      }

      if (key === 'y') {
        event.preventDefault()
        void onRedo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onRedo, onUndo])

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
                onClick={() => {
                  setProjectIdPendingDelete(project.id)
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
              <div className="relative">
                <select
                  id="model"
                  value={modelId}
                  className="border-input bg-input/30 h-9 w-full min-w-0 appearance-none rounded-4xl border pl-3 pr-11 text-sm"
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
                <span className="text-muted-foreground pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                  <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                    <path d="M4.22 6.47a.75.75 0 0 1 1.06 0L8 9.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.53a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </span>
              </div>

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
                  <div className="relative">
                    <select
                      id="ratio"
                      value={aspectRatio}
                      className="border-input bg-input/30 h-9 w-full min-w-0 appearance-none rounded-4xl border pl-3 pr-11 text-sm"
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
                    <span className="text-muted-foreground pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                        <path d="M4.22 6.47a.75.75 0 0 1 1.06 0L8 9.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.53a.75.75 0 0 1 0-1.06Z" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="grid min-w-0 gap-1">
                  <Label htmlFor="resolution">{m.generation_resolution_label()}</Label>
                  <div className="relative">
                    <select
                      id="resolution"
                      value={resolutionPreset}
                      className="border-input bg-input/30 h-9 w-full min-w-0 appearance-none rounded-4xl border pl-3 pr-11 text-sm"
                      onChange={(event) => {
                        setResolutionPreset(event.target.value as typeof resolutionPreset)
                      }}
                    >
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                    </select>
                    <span className="text-muted-foreground pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                        <path d="M4.22 6.47a.75.75 0 0 1 1.06 0L8 9.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.53a.75.75 0 0 1 0-1.06Z" />
                      </svg>
                    </span>
                  </div>
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
                <p className="text-muted-foreground text-xs">{m.generation_outputs_experimental()}</p>
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
                <div className="bg-muted/60 text-muted-foreground rounded-xl p-2 text-xs">
                  <div className="flex items-start gap-2">
                    {remixPreviewAsset ? (
                      <button
                        type="button"
                        className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-border/70"
                        onClick={() => {
                          if (!remixOfAssetId) {
                            return
                          }

                          openLightbox({
                            title: m.generation_title(),
                            initialAssetId: remixOfAssetId,
                            items: [
                              {
                                assetId: remixOfAssetId,
                                label: m.timeline_output(),
                              },
                            ],
                          })
                        }}
                      >
                        <AssetThumb asset={remixPreviewAsset} alt={m.timeline_output()} />
                      </button>
                    ) : null}
                    <div className="min-w-0">
                      <p>{m.generation_remix_active({ stepId: remixOfStepId })}</p>
                      {remixOfAssetId ? (
                        <p className="text-muted-foreground/90">{m.generation_remix_asset_selected()}</p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-foreground mt-2 underline"
                    onClick={() => {
                      setRemixOfStepId(undefined)
                      setRemixOfAssetId(undefined)
                      if (remixSnapshot) {
                        setModelId(remixSnapshot.modelId)
                        setPrompt(remixSnapshot.prompt)
                        setNegativePrompt(remixSnapshot.negativePrompt)
                        setAspectRatio(remixSnapshot.aspectRatio)
                        setResolutionPreset(remixSnapshot.resolutionPreset)
                        setOutputCount(remixSnapshot.outputCount)
                        setSelectedReferenceIds(remixSnapshot.selectedReferenceIds)
                        setSelectedPersonaIds(remixSnapshot.selectedPersonaIds)
                        setRemixSnapshot(null)
                      }
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
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || !youtubeUrl.trim()) {
                      return
                    }

                    event.preventDefault()
                    void onImportYoutube()
                  }}
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
                      <button
                        type="button"
                        className="h-16 w-20 overflow-hidden rounded-xl"
                        onClick={(event) => {
                          event.stopPropagation()
                          openLightbox({
                            title: m.references_title(),
                            initialAssetId: asset.id,
                            items: referenceAssets.map((entry) => ({
                              assetId: entry.id,
                              label: m.references_title(),
                            })),
                          })
                        }}
                      >
                        <AssetThumb asset={asset} alt={m.references_title()} />
                      </button>
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
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedPersonaNames.length === 0 ? (
                      <Badge variant="outline">{m.common_none()}</Badge>
                    ) : (
                      <>
                        {displayedPersonaNames.map((name) => (
                          <Badge key={name} variant="outline">
                            {name}
                          </Badge>
                        ))}
                        {personaOverflowCount > 0 ? (
                          <Badge variant="outline">+{personaOverflowCount}</Badge>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setIsPersonaModalOpen(true)}>
                  {m.personas_open_manager()}
                </Button>
              </div>
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
                          onClick={() => {
                            setProjectIdPendingDelete(row.project.id)
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>{m.timeline_title()}</CardTitle>
                  <CardDescription>{m.timeline_description()}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={historyBusy || undoStack.length === 0}
                    onClick={() => {
                      void onUndo()
                    }}
                  >
                    {m.timeline_action_undo()}
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={historyBusy || redoStack.length === 0}
                    onClick={() => {
                      void onRedo()
                    }}
                  >
                    {m.timeline_action_redo()}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {timelineItems.length === 0 ? (
                <div className="bg-muted/30 text-muted-foreground rounded-2xl p-6 text-sm">
                  {m.timeline_empty()}
                </div>
              ) : (
                <ol className="relative space-y-4 border-l border-dashed pl-5">
                  {timelineItems.map((item) => {
                    const collapsed = collapsedStepIds.includes(item.id)

                    return (
                      <li key={item.id} className="relative">
                        <span className="bg-primary absolute -left-[1.72rem] top-3 h-3 w-3 rounded-full" />

                        {item.type === 'prompt' ? (
                          <Card size="sm" className="gap-4">
                            <CardHeader>
                              <div className="flex items-center justify-between gap-2">
                                <CardTitle className="text-base">{m.timeline_prompt()}</CardTitle>
                                <div className="flex items-center gap-2">
                                  <Badge>{formatDate(item.createdAt)}</Badge>
                                  <Button
                                    size="xs"
                                    variant="destructive"
                                    onClick={() => {
                                      onRequestDeleteTimelineStep(item.sourceStepId, m.timeline_prompt())
                                    }}
                                  >
                                    {m.timeline_action_delete()}
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => toggleStepCollapsed(item.id)}
                                  >
                                    {collapsed ? m.timeline_expand() : m.timeline_collapse()}
                                  </Button>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button size="xs" variant="outline" onClick={() => onReusePrompt(item.input)}>
                                  {m.timeline_action_reuse_prompt()}
                                </Button>
                                <Button
                                  size="xs"
                                  variant="destructive"
                                  onClick={() => {
                                    onRequestDeleteTimelineStep(item.sourceStepId, m.timeline_prompt())
                                  }}
                                >
                                  {m.timeline_action_delete()}
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent className="min-w-0 space-y-3 overflow-hidden">
                              {collapsed ? (
                                <p className="text-muted-foreground truncate text-sm">{item.input.prompt}</p>
                              ) : (
                                <>
                                  <div className="rounded-xl bg-zinc-900/90 p-3 text-xs text-zinc-100">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-zinc-400">{m.timeline_prompt()}</p>
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        className="border-zinc-500/60 bg-transparent text-zinc-100 hover:bg-zinc-700/70 hover:text-zinc-100"
                                        onClick={() => {
                                          void onCopyText(item.input.prompt)
                                        }}
                                      >
                                        {m.timeline_action_copy_prompt()}
                                      </Button>
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap">{item.input.prompt}</p>
                                  </div>

                                  {item.input.negativePrompt ? (
                                    <div className="rounded-xl bg-zinc-100 p-3 text-xs text-zinc-900 ring-1 ring-zinc-200">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-zinc-500">{m.timeline_negative_prompt()}</p>
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          className="border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-200 dark:hover:text-zinc-900"
                                          onClick={() => {
                                            void onCopyText(item.input.negativePrompt ?? '')
                                          }}
                                        >
                                          {m.timeline_action_copy_negative_prompt()}
                                        </Button>
                                      </div>
                                      <p className="mt-1 whitespace-pre-wrap">{item.input.negativePrompt}</p>
                                    </div>
                                  ) : null}

                                  <CardDescription>
                                    {m.timeline_model_line({
                                      model: item.input.modelId,
                                      resolution: item.input.resolutionPreset,
                                      ratio: item.input.aspectRatio,
                                    })}
                                  </CardDescription>

                                  <div className="flex min-w-0 flex-wrap gap-2">
                                    <span className="text-muted-foreground text-xs">
                                      {m.timeline_references_label()}:
                                    </span>
                                    {item.input.referenceAssetIds.length === 0 ? (
                                      <Badge variant="outline">{m.timeline_references_none()}</Badge>
                                    ) : (
                                      item.input.referenceAssetIds.map((assetId) => {
                                        const missingReferences = missingReferenceIdsByStep.get(item.id)
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

                                </>
                              )}
                            </CardContent>
                          </Card>
                        ) : item.type === 'generation' ? (
                          <Card size="sm" className="gap-4">
                            <CardHeader>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <CardTitle className="text-base">{m.timeline_generation_step()}</CardTitle>
                                  {item.trace?.fallbackUsed ? (
                                    <Badge variant="outline">{m.timeline_fallback_badge()}</Badge>
                                  ) : null}
                                  {item.status === 'pending' ? (
                                    <Badge variant="outline">{m.generation_button_busy()}</Badge>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge>{formatDate(item.createdAt)}</Badge>
                                  <Button
                                    size="xs"
                                    variant="destructive"
                                    onClick={() => {
                                      onRequestDeleteTimelineStep(item.sourceStepId, m.timeline_generation_step())
                                    }}
                                  >
                                    {m.timeline_action_delete()}
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => toggleStepCollapsed(item.id)}
                                  >
                                    {collapsed ? m.timeline_expand() : m.timeline_collapse()}
                                  </Button>
                                </div>
                              </div>
                              {!collapsed ? (
                                <CardDescription>
                                  {m.timeline_model_line({
                                    model: item.input.modelId,
                                    resolution: item.input.resolutionPreset,
                                    ratio: item.input.aspectRatio,
                                  })}
                                </CardDescription>
                              ) : null}
                            </CardHeader>
                            <CardContent className="min-w-0 space-y-3 overflow-hidden">
                              {item.status === 'pending' ? (
                                <div
                                  className={`grid gap-3 ${
                                    item.input.outputCount <= 1
                                      ? 'grid-cols-1'
                                      : item.input.outputCount === 2
                                        ? 'md:grid-cols-2'
                                        : 'md:grid-cols-2 xl:grid-cols-3'
                                  }`}
                                >
                                  {Array.from({ length: Math.max(1, item.input.outputCount) }).map((_, index) => (
                                    <div
                                      key={`${item.id}:skeleton:${index}`}
                                      className="border-border/60 overflow-hidden rounded-2xl border p-2"
                                    >
                                      <div className="bg-muted h-44 animate-pulse rounded-xl" />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div
                                  className={`grid gap-3 ${
                                    item.outputs.length <= 1
                                      ? 'grid-cols-1'
                                      : item.outputs.length === 2
                                        ? 'md:grid-cols-2'
                                        : 'md:grid-cols-2 xl:grid-cols-3'
                                  }`}
                                >
                                  {item.outputs.map((output, outputIndex) => {
                                    const asset = assetsMap.get(output.assetId)
                                    if (!asset) {
                                      return null
                                    }

                                    return (
                                      <div
                                        key={output.assetId}
                                        className="group border-border/60 overflow-hidden rounded-2xl border"
                                      >
                                        <div
                                          role="button"
                                          tabIndex={0}
                                          className="relative w-full cursor-zoom-in overflow-hidden bg-muted/20"
                                          style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
                                          onClick={() => {
                                            openLightbox({
                                              title: m.timeline_generation_step(),
                                              initialAssetId: output.assetId,
                                              items: item.outputs.map((entry, index) => ({
                                                assetId: entry.assetId,
                                                label: `${m.timeline_output()} ${index + 1}`,
                                              })),
                                            })
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key !== 'Enter' && event.key !== ' ') {
                                              return
                                            }

                                            event.preventDefault()
                                            openLightbox({
                                              title: m.timeline_generation_step(),
                                              initialAssetId: output.assetId,
                                              items: item.outputs.map((entry, index) => ({
                                                assetId: entry.assetId,
                                                label: `${m.timeline_output()} ${index + 1}`,
                                              })),
                                            })
                                          }}
                                        >
                                          <AssetThumb asset={asset} alt={m.timeline_output()} />
                                          <div className="absolute inset-2 flex items-start justify-end gap-2 opacity-0 transition group-hover:opacity-100">
                                            <Button
                                              size="xs"
                                              variant="secondary"
                                              onClick={(event) => {
                                                event.stopPropagation()
                                                onRemixFrom(item, output.assetId)
                                              }}
                                            >
                                              {m.timeline_action_remix()}
                                            </Button>
                                            <Button
                                              size="xs"
                                              variant="secondary"
                                              onClick={(event) => {
                                                event.stopPropagation()
                                                openEditorForAsset(output.assetId)
                                              }}
                                            >
                                              {m.timeline_action_edit()}
                                            </Button>
                                            <Button
                                              size="xs"
                                              variant="secondary"
                                              onClick={(event) => {
                                                event.stopPropagation()
                                                void exportSingleAsset(output.assetId)
                                              }}
                                            >
                                              {m.timeline_action_jpg()}
                                            </Button>
                                          </div>
                                        </div>

                                        {!collapsed ? (
                                          <div className="space-y-2 p-3">
                                            <p className="text-muted-foreground text-xs">
                                              {outputIndex + 1}. {asset.width}x{asset.height} · {asset.mimeType}
                                            </p>
                                          </div>
                                        ) : null}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              {item.status === 'failed' ? (
                                <p className="text-destructive text-xs">{m.generation_status_failed()}</p>
                              ) : null}

                              {!collapsed && settings.nerdMode ? (
                                <div className="bg-muted/30 rounded-xl p-3 text-xs">
                                  <p>{m.timeline_nerd_step_id({ id: item.sourceStepId })}</p>
                                  <p>{m.timeline_nerd_status({ status: item.status })}</p>
                                  <p>
                                    {m.timeline_nerd_references({
                                      count: String(item.input.referenceAssetIds.length),
                                    })}
                                  </p>
                                  <p>
                                    {m.timeline_nerd_personas({
                                      count: String(item.input.personaIds.length),
                                    })}
                                  </p>
                                  <p>
                                    {m.timeline_nerd_requested_outputs({
                                      count: String(item.input.outputCount),
                                    })}
                                  </p>
                                  {item.trace?.fallbackUsed ? <p>{m.timeline_nerd_fallback_used()}</p> : null}
                                  {item.trace?.requestAt ? (
                                    <p>
                                      {m.timeline_nerd_request_started({
                                        date: formatDate(item.trace.requestAt),
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
                                <div className="flex items-center gap-2">
                                  <Badge>{formatDate(item.step.createdAt)}</Badge>
                                  <Button
                                    size="xs"
                                    variant="destructive"
                                    onClick={() => {
                                      onRequestDeleteTimelineStep(item.step.id, m.timeline_edit_step())
                                    }}
                                  >
                                    {m.timeline_action_delete()}
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => toggleStepCollapsed(item.id)}
                                  >
                                    {collapsed ? m.timeline_expand() : m.timeline_collapse()}
                                  </Button>
                                </div>
                              </div>
                              {collapsed ? null : (
                                <CardDescription>{m.timeline_edit_description()}</CardDescription>
                              )}
                            </CardHeader>
                            <CardContent className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-2">
                                <p className="text-xs font-medium">{m.timeline_source()}</p>
                                {assetsMap.get(item.step.sourceAssetId) ? (
                                  <button
                                    type="button"
                                    className="w-full overflow-hidden rounded-xl bg-muted/20"
                                    style={{
                                      aspectRatio: `${(assetsMap.get(item.step.sourceAssetId) as OutputAsset).width} / ${(assetsMap.get(item.step.sourceAssetId) as OutputAsset).height}`,
                                    }}
                                    onClick={() => {
                                      openLightbox({
                                        title: m.timeline_edit_step(),
                                        initialAssetId: item.step.sourceAssetId,
                                        items: [
                                          {
                                            assetId: item.step.sourceAssetId,
                                            label: m.timeline_source(),
                                          },
                                        ],
                                      })
                                    }}
                                  >
                                    <AssetThumb
                                      asset={assetsMap.get(item.step.sourceAssetId) as OutputAsset}
                                      alt={m.timeline_source()}
                                    />
                                  </button>
                                ) : (
                                  <div className="bg-muted text-muted-foreground flex h-40 items-center justify-center rounded-xl text-xs">
                                    {m.timeline_missing_source()}
                                  </div>
                                )}
                              </div>
                              <div className="space-y-2">
                                <p className="text-xs font-medium">{m.timeline_output()}</p>
                                {assetsMap.get(item.step.outputAssetId) ? (
                                  <button
                                    type="button"
                                    className="w-full overflow-hidden rounded-xl bg-muted/20"
                                    style={{
                                      aspectRatio: `${(assetsMap.get(item.step.outputAssetId) as OutputAsset).width} / ${(assetsMap.get(item.step.outputAssetId) as OutputAsset).height}`,
                                    }}
                                    onClick={() => {
                                      openLightbox({
                                        title: m.timeline_edit_step(),
                                        initialAssetId: item.step.outputAssetId,
                                        items: [
                                          {
                                            assetId: item.step.outputAssetId,
                                            label: m.timeline_output(),
                                          },
                                        ],
                                      })
                                    }}
                                  >
                                    <AssetThumb
                                      asset={assetsMap.get(item.step.outputAssetId) as OutputAsset}
                                      alt={m.timeline_output()}
                                    />
                                  </button>
                                ) : (
                                  <div className="bg-muted text-muted-foreground flex h-40 items-center justify-center rounded-xl text-xs">
                                    {m.timeline_missing_output()}
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => onRemixFromAsset(item.step.outputAssetId)}
                                  >
                                    {m.timeline_action_remix()}
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => openEditorForAsset(item.step.outputAssetId)}
                                  >
                                    {m.timeline_action_edit()}
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => void exportSingleAsset(item.step.outputAssetId)}
                                  >
                                    {m.timeline_export_jpg()}
                                  </Button>
                                </div>
                              </div>
                              {!collapsed && settings.nerdMode ? (
                                <div className="bg-muted/30 col-span-full rounded-xl p-3 text-xs">
                                  <p>{m.timeline_nerd_step_id({ id: item.step.id })}</p>
                                  <p>{m.timeline_nerd_rotate({ value: String(item.step.operations.rotate) })}</p>
                                  <p>
                                    {m.timeline_nerd_brightness({
                                      value: String(item.step.operations.brightness),
                                    })}
                                  </p>
                                  <p>
                                    {m.timeline_nerd_contrast({
                                      value: String(item.step.operations.contrast),
                                    })}
                                  </p>
                                  <p>
                                    {m.timeline_nerd_saturation({
                                      value: String(item.step.operations.saturation),
                                    })}
                                  </p>
                                  <p>{m.timeline_nerd_blur({ value: String(item.step.operations.blur) })}</p>
                                  <p>
                                    {m.timeline_nerd_sharpen({
                                      value: String(item.step.operations.sharpen),
                                    })}
                                  </p>
                                </div>
                              ) : null}
                            </CardContent>
                          </Card>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <AlertDialog
        open={timelineStepPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTimelineStepPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogTitle>{m.timeline_delete_confirm_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.timeline_delete_confirm_description({
                step: timelineStepPendingDelete?.label ?? m.common_unknown(),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_close()}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onConfirmDeleteTimelineStep()}>
              {m.timeline_action_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogTitle>{m.project_delete()}</AlertDialogTitle>
            <AlertDialogDescription>{m.project_delete_confirm_description()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_close()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!projectIdPendingDelete) {
                  return
                }

                await removeProjectAndRefresh(projectIdPendingDelete)
                setProjectIdPendingDelete(null)

                if (projectIdPendingDelete === project.id) {
                  await navigate({ to: '/' })
                  return
                }

                if (cleanupStateVisible) {
                  await onLoadCleanup()
                }
              }}
            >
              {m.projects_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        onOpenLightbox={(context) => {
          openLightbox(context)
        }}
      />

      <ImageLightboxModal
        open={Boolean(lightboxContext)}
        title={lightboxContext?.title ?? m.timeline_output()}
        items={lightboxGalleryItems}
        initialAssetId={lightboxContext?.initialAssetId}
        onClose={() => setLightboxContext(null)}
      />
    </main>
  )
}

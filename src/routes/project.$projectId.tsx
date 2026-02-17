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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
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
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getModelCapability(models: Array<ModelCapability>, modelId: string) {
  return models.find((model) => model.id === modelId)
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

type TimelineItem =
  | PromptTimelineItem
  | GenerationTimelineItem
  | EditTimelineItem

interface StepUndoEntry {
  step: TimelineStep
  assets: Array<OutputAsset>
}

/* ─── Main component ──────────────────────────────────────────────── */

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
  const [aspectRatio, setAspectRatio] = useState<
    '1:1' | '4:3' | '16:9' | '9:16'
  >('16:9')
  const [resolutionPreset, setResolutionPreset] = useState<'720p' | '1080p'>(
    '720p',
  )
  const [outputCount, setOutputCount] = useState(1)
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<
    Array<string>
  >([])
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Array<string>>(
    [],
  )
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [editorSourceAssetId, setEditorSourceAssetId] = useState<string | null>(
    null,
  )
  const [editorOperations, setEditorOperations] =
    useState<EditOperations>(DEFAULT_EDITOR_OPS)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false)
  const [remixOfStepId, setRemixOfStepId] = useState<string | undefined>(
    undefined,
  )
  const [remixOfAssetId, setRemixOfAssetId] = useState<string | undefined>(
    undefined,
  )
  const [collapsedStepIds, setCollapsedStepIds] = useState<Array<string>>([])
  const [lightboxContext, setLightboxContext] =
    useState<LightboxContext | null>(null)
  const [cleanupStateVisible, setCleanupStateVisible] = useState(false)
  const [cleanupRows, setCleanupRows] = useState<
    Array<{ project: { id: string; name: string }; bytes: number }>
  >([])
  const [projectIdPendingDelete, setProjectIdPendingDelete] = useState<
    string | null
  >(null)
  const [timelineStepPendingDelete, setTimelineStepPendingDelete] = useState<{
    id: string
    label: string
  } | null>(null)
  const [hasHydrated, setHasHydrated] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
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
  const stepById = useMemo(
    () => new Map(steps.map((step) => [step.id, step])),
    [steps],
  )

  const supportsNegativePrompt =
    modelCapability?.supportsNegativePrompt ?? false
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
        if (!resolvedInput) continue

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
        if (!resolvedInput) continue

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
      if (createdAtDiff !== 0) return createdAtDiff
      if (a.sortGroupId === b.sortGroupId) return a.sortOrder - b.sortOrder
      return a.sortGroupId.localeCompare(b.sortGroupId)
    })
  }, [promptStepsById, steps])

  const selectedEditorAsset = editorSourceAssetId
    ? (assetsMap.get(editorSourceAssetId) ?? null)
    : null
  const remixPreviewAsset = remixOfAssetId
    ? (assetsMap.get(remixOfAssetId) ?? null)
    : null
  const selectedPersonaNames = useMemo(
    () =>
      selectedPersonaIds
        .map(
          (personaId) =>
            personas.find((persona) => persona.id === personaId)?.name,
        )
        .filter((name): name is string => Boolean(name)),
    [personas, selectedPersonaIds],
  )
  const displayedPersonaNames = selectedPersonaNames.slice(0, 2)
  const personaOverflowCount = Math.max(
    0,
    selectedPersonaNames.length - displayedPersonaNames.length,
  )
  const lightboxGalleryItems = useMemo(() => {
    if (!lightboxContext) return []
    return lightboxContext.items
      .map((item) => {
        const asset = assetsMap.get(item.assetId)
        if (!asset) return null
        return { asset, label: item.label }
      })
      .filter((item): item is { asset: OutputAsset; label: string } =>
        Boolean(item),
      )
  }, [assetsMap, lightboxContext])

  /* ─── Effects ──────────────────────────────────────────────────── */

  useEffect(() => {
    if (!project) return
    if (initializedProjectIdRef.current === project.id) return
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
    if (modelId || !models.length) return
    const available = models.find((entry) => entry.availability === 'available')
    if (available) setModelId(available.id)
  }, [modelId, models])

  useEffect(() => {
    if (!project) return
    savePromptDraft(project.id, { prompt, negativePrompt })
  }, [negativePrompt, project, prompt])

  useEffect(() => {
    if (!project) return
    setCollapsedStepIds((current) => {
      const stepIds = new Set(timelineItems.map((step) => step.id))
      const next = current.filter((id) => stepIds.has(id))
      const existing = new Set(next)
      for (const step of timelineItems) {
        if (!existing.has(step.id)) next.push(step.id)
      }
      if (
        next.length === current.length &&
        next.every((id, index) => id === current[index])
      ) {
        return current
      }
      return next
    })
  }, [project, timelineItems])

  useEffect(() => {
    if (!project) return
    saveTimelineUiState(project.id, { collapsedStepIds })
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

  const unavailableModelSelected =
    modelCapability?.availability === 'unavailable'

  /* ─── Handlers ─────────────────────────────────────────────────── */

  const onReferenceFiles = async (files: Array<File>) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) return
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
    if (!files.length) return
    event.preventDefault()
    await onReferenceFiles(files)
  }

  const onGenerate = async () => {
    if (!project || !modelId) return
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
    setCleanupRows(
      rows.map((entry) => ({ project: entry.project, bytes: entry.bytes })),
    )
  }

  const openLightbox = (context: LightboxContext) => {
    if (!context.items.length) return
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
      // no-op
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
    setRemixSnapshot(
      (current) =>
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
      Array.from(
        new Set([outputAssetId, ...generation.input.referenceAssetIds]),
      ),
    )
    setRemixOfStepId(generation.sourceStepId)
    setRemixOfAssetId(outputAssetId)
  }

  const onRemixFromAsset = (outputAssetId: string) => {
    setRemixSnapshot(
      (current) =>
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
        Array.from(
          new Set([outputAssetId, ...generation.input.referenceAssetIds]),
        ),
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
      if (!step) return null
      const assets: Array<OutputAsset> = []
      if (step.type === 'generation' || step.type === 'generation-result') {
        for (const output of step.outputs) {
          const asset = assetsMap.get(output.assetId)
          if (asset?.scope === 'project') assets.push(asset)
        }
      } else if (step.type === 'edit') {
        const asset = assetsMap.get(step.outputAssetId)
        if (asset?.scope === 'project') assets.push(asset)
      }
      return { step, assets }
    },
    [assetsMap, stepById],
  )

  const onRequestDeleteTimelineStep = (sourceStepId: string, label: string) => {
    setTimelineStepPendingDelete({ id: sourceStepId, label })
  }

  const onConfirmDeleteTimelineStep = async () => {
    if (!timelineStepPendingDelete) return
    const pending = timelineStepPendingDelete
    setTimelineStepPendingDelete(null)
    const snapshot = buildUndoEntry(pending.id)
    if (!snapshot) return
    setHistoryBusy(true)
    try {
      await removeTimelineStep(pending.id)
      setUndoStack((current) => [...current, snapshot])
      setRedoStack([])
    } finally {
      setHistoryBusy(false)
    }
  }

  const onUndo = useCallback(async () => {
    if (historyBusy) return
    let entry: StepUndoEntry | null = null
    setUndoStack((current) => {
      if (!current.length) return current
      entry = current[current.length - 1]
      return current.slice(0, -1)
    })
    if (!entry) return
    setHistoryBusy(true)
    try {
      await restoreTimelineStep(entry)
      setRedoStack((current) => [...current, entry as StepUndoEntry])
    } finally {
      setHistoryBusy(false)
    }
  }, [historyBusy, restoreTimelineStep])

  const onRedo = useCallback(async () => {
    if (historyBusy) return
    let entry: StepUndoEntry | null = null
    setRedoStack((current) => {
      if (!current.length) return current
      entry = current[current.length - 1]
      return current.slice(0, -1)
    })
    if (!entry) return
    setHistoryBusy(true)
    try {
      await removeTimelineStep((entry as StepUndoEntry).step.id)
      setUndoStack((current) => [...current, entry as StepUndoEntry])
    } finally {
      setHistoryBusy(false)
    }
  }, [historyBusy, removeTimelineStep])

  useEffect(() => {
    setHasHydrated(true)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      )
        return

      const isMetaOrCtrl = event.metaKey || event.ctrlKey
      if (!isMetaOrCtrl) return

      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) void onRedo()
        else void onUndo()
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

  /* ─── Loading / Not found ──────────────────────────────────────── */

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="bg-primary/20 h-8 w-8 animate-pulse rounded-full" />
          <p suppressHydrationWarning className="text-muted-foreground text-sm">
            {hasHydrated ? m.loading_workshop() : 'Loading workshop...'}
          </p>
        </div>
      </main>
    )
  }

  if (!project) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>{m.project_not_found_title()}</CardTitle>
            <CardDescription>
              {m.project_not_found_description()}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => navigate({ to: '/' })}>
              {m.project_not_found_back()}
            </Button>
          </CardFooter>
        </Card>
      </main>
    )
  }

  /* ─── Main layout ──────────────────────────────────────────────── */

  return (
    <main
      className="from-background via-background to-muted/20 flex h-screen flex-col overflow-hidden bg-gradient-to-br"
      onPaste={(event) => void onPasteReferences(event)}
    >
      {/* ─── Top bar ─────────────────────────────────────────────── */}
      <header className="bg-card/80 z-30 flex-none border-b backdrop-blur-lg">
        <div className="flex items-center gap-3 px-4 py-2 md:px-8">
          <Button
            size="sm"
            variant="outline"
            className="xl:hidden"
            onClick={() => setMobileSidebarOpen(true)}
          >
            {m.generation_title()}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate({ to: '/' })}
          >
            <svg
              viewBox="0 0 16 16"
              className="mr-1.5 h-3.5 w-3.5 fill-current"
              aria-hidden="true"
            >
              <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L3.47 9.28a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 1.06L5.56 8.25h6.69a.75.75 0 0 1 0 1.5H5.56l2.22 2.22a.75.75 0 0 1 0 1.06Z" />
            </svg>
            {m.projects_title()}
          </Button>

          <Separator orientation="vertical" className="!h-5" />

          <div className="min-w-0 flex-1">
            <Input
              value={project.name}
              className="focus:border-border border-transparent bg-transparent text-sm font-medium"
              onChange={async (event) => {
                await updateProjectDefaults({ name: event.target.value })
              }}
            />
          </div>

          <span className="text-muted-foreground hidden text-xs md:block">
            {m.project_updated({ date: formatDate(project.updatedAt) })}
          </span>

          <input
            ref={backupInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              void importBackup(file)
              event.target.value = ''
            }}
          />

          <div className="pretty-scroll flex items-center gap-1.5 overflow-x-auto">
            <Button
              size="xs"
              variant="outline"
              className="shrink-0"
              onClick={() => void exportBackup()}
            >
              {m.project_backup_export()}
            </Button>
            <Button
              size="xs"
              variant="outline"
              className="shrink-0"
              onClick={() => backupInputRef.current?.click()}
            >
              {m.project_backup_import()}
            </Button>
            <Button
              size="xs"
              variant="destructive"
              className="shrink-0"
              onClick={() => setProjectIdPendingDelete(project.id)}
            >
              {m.project_delete()}
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Content: fixed viewport, two independent scroll regions ─ */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {mobileSidebarOpen ? (
          <button
            type="button"
            className="absolute inset-0 z-10 bg-black/45 xl:hidden"
            aria-label={m.common_close()}
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}

        {/* ── Left sidebar ─ independently scrollable ────────────── */}
        <aside
          className={`pretty-scroll bg-background absolute inset-y-0 left-0 z-20 w-[min(92vw,400px)] flex-none space-y-3 overflow-y-auto border-r p-4 shadow-xl transition-transform xl:static xl:w-[400px] xl:translate-x-0 xl:shadow-none ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-[102%]'
          }`}
        >
          <div className="mb-1 flex items-center justify-between xl:hidden">
            <p className="text-sm font-semibold">{m.generation_title()}</p>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setMobileSidebarOpen(false)}
            >
              {m.common_close()}
            </Button>
          </div>

          {/* Generation card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {m.generation_title()}
              </CardTitle>
              <CardDescription className="text-xs">
                {m.generation_description()}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-3 overflow-hidden pt-0">
              <div className="grid gap-1.5">
                <Label htmlFor="model" className="text-xs">
                  {m.generation_model_label()}
                </Label>
                <Select
                  value={modelId}
                  onValueChange={(val) => {
                    if (val !== null) setModelId(val)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={m.generation_model_placeholder()}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem
                        key={model.id}
                        value={model.id}
                        label={`${model.name}${
                          model.availability === 'unavailable'
                            ? ` ${m.generation_model_unavailable_suffix()}`
                            : ''
                        }`}
                      >
                        {model.name}
                        {model.availability === 'unavailable'
                          ? ` ${m.generation_model_unavailable_suffix()}`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {unavailableModelSelected ? (
                <p className="text-destructive text-xs font-medium">
                  {m.generation_model_unavailable()}
                </p>
              ) : null}

              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">
                    {m.generation_ratio_label()}
                  </Label>
                  <Select
                    value={aspectRatio}
                    onValueChange={(val) => {
                      if (val !== null)
                        setAspectRatio(val as typeof aspectRatio)
                    }}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASPECT_RATIOS.map((ratio) => (
                        <SelectItem key={ratio} value={ratio} label={ratio}>
                          {ratio}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">
                    {m.generation_resolution_label()}
                  </Label>
                  <Select
                    value={resolutionPreset}
                    onValueChange={(val) => {
                      if (val !== null)
                        setResolutionPreset(val as typeof resolutionPreset)
                    }}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p" label="720p">
                        720p
                      </SelectItem>
                      <SelectItem value="1080p" label="1080p">
                        1080p
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">
                  {m.generation_outputs_label({
                    count: String(outputCount),
                  })}
                </Label>
                <input
                  type="range"
                  min={1}
                  max={maxOutputs}
                  value={outputCount}
                  className="range-input h-2.5 w-full min-w-0"
                  onChange={(event) =>
                    setOutputCount(Number(event.target.value))
                  }
                />
                <p className="text-muted-foreground text-[11px]">
                  {m.generation_outputs_experimental()}
                </p>
              </div>

              {/* ── Prompt ───────────────────────── */}
              <div className="grid gap-1.5">
                <Label htmlFor="prompt" className="text-xs">
                  {m.generation_prompt_label?.() ?? 'Prompt'}
                </Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  placeholder={m.generation_prompt_placeholder()}
                  className="min-h-[100px] resize-y"
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key === 'Enter'
                    ) {
                      event.preventDefault()
                      if (!busy && modelId && prompt.trim()) void onGenerate()
                    }
                  }}
                />
              </div>

              {supportsNegativePrompt ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="negative-prompt" className="text-xs">
                    {m.generation_negative_label?.() ?? 'Negative prompt'}
                  </Label>
                  <Textarea
                    id="negative-prompt"
                    value={negativePrompt}
                    placeholder={m.generation_negative_placeholder()}
                    className="min-h-[48px] resize-y text-sm"
                    onChange={(event) => setNegativePrompt(event.target.value)}
                  />
                </div>
              ) : null}

              <Button
                className="w-full"
                disabled={
                  busy || !modelId || unavailableModelSelected || !prompt.trim()
                }
                onClick={() => void onGenerate()}
              >
                {busy
                  ? m.generation_button_busy()
                  : remixOfStepId
                    ? m.generation_button_remix()
                    : m.generation_button()}
              </Button>

              {remixOfStepId ? (
                <div className="bg-primary/5 border-primary/20 rounded-xl border p-2.5 text-xs">
                  <div className="flex items-start gap-2">
                    {remixPreviewAsset ? (
                      <button
                        type="button"
                        className="border-border/70 h-14 w-20 shrink-0 overflow-hidden rounded-lg border"
                        onClick={() => {
                          if (!remixOfAssetId) return
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
                        <AssetThumb
                          asset={remixPreviewAsset}
                          alt={m.timeline_output()}
                        />
                      </button>
                    ) : null}
                    <div className="min-w-0">
                      <p className="text-foreground font-medium">
                        {m.generation_remix_active({
                          stepId: remixOfStepId,
                        })}
                      </p>
                      {remixOfAssetId ? (
                        <p className="text-muted-foreground">
                          {m.generation_remix_asset_selected()}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-primary mt-2 text-xs underline"
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
                        setSelectedReferenceIds(
                          remixSnapshot.selectedReferenceIds,
                        )
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

          {/* References card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {m.references_title()}
              </CardTitle>
              <CardDescription className="text-xs">
                {m.references_description()}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-0">
              <div
                className="border-border/50 hover:border-primary/40 bg-muted/10 group/drop cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => void onDropReferences(event)}
                onClick={() => referenceInputRef.current?.click()}
              >
                <div className="text-muted-foreground text-sm">
                  {m.references_drop_hint()}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    referenceInputRef.current?.click()
                  }}
                >
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

              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  placeholder={m.references_youtube_placeholder()}
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || !youtubeUrl.trim()) return
                    event.preventDefault()
                    void onImportYoutube()
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void onImportYoutube()}
                >
                  {m.references_youtube_import()}
                </Button>
              </div>

              {supportsReferences ? null : (
                <p className="text-muted-foreground bg-muted/40 rounded-lg p-2 text-xs">
                  {m.references_model_unsupported()}
                </p>
              )}

              <div className="pretty-scroll max-h-56 min-w-0 space-y-1.5 overflow-auto pr-1">
                {referenceAssets.length === 0 ? (
                  <p className="text-muted-foreground border-border/50 rounded-xl border border-dashed p-3 text-center text-sm">
                    {m.references_empty()}
                  </p>
                ) : null}

                {referenceAssets.map((asset) => {
                  const selected = selectedReferenceIds.includes(asset.id)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`grid w-full min-w-0 grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border p-1.5 text-left transition-all ${
                        selected
                          ? 'border-primary/60 bg-primary/5 ring-primary/20 ring-1'
                          : 'border-border/50 bg-card hover:border-primary/30'
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
                        className="h-14 w-[72px] overflow-hidden rounded-lg"
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
                        <p className="text-muted-foreground truncate">
                          {asset.width}x{asset.height}
                        </p>
                      </div>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
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

              <Separator />

              {/* Personas section */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{m.personas_title()}</p>
                  <p className="text-muted-foreground text-xs">
                    {m.personas_selected({
                      count: String(selectedPersonaIds.length),
                    })}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
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
                          <Badge variant="outline">
                            +{personaOverflowCount}
                          </Badge>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsPersonaModalOpen(true)}
                >
                  {m.personas_open_manager()}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Exports card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{m.exports_title()}</CardTitle>
              <CardDescription className="text-xs">
                {m.exports_description()}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void exportProjectBatch()}
              >
                {m.exports_batch({ count: String(outputAssets.length) })}
              </Button>
            </CardContent>
          </Card>

          {/* Quota warning */}
          {quotaState ? (
            <Card className="border-destructive/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-destructive text-base">
                  {m.quota_title()}
                </CardTitle>
                <CardDescription className="text-xs">
                  {quotaState.reason}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 pt-0">
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
                  <div className="pretty-scroll max-h-44 space-y-1.5 overflow-auto pr-1">
                    {cleanupRows.map((row) => (
                      <div
                        key={row.project.id}
                        className="bg-muted/30 flex items-center justify-between rounded-lg px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {row.project.name}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {m.quota_estimated_size({
                              size: bytesToSize(row.bytes),
                            })}
                          </p>
                        </div>
                        <Button
                          size="xs"
                          variant="destructive"
                          onClick={() =>
                            setProjectIdPendingDelete(row.project.id)
                          }
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

          {/* Error card */}
          {error ? (
            <Card className="border-destructive/30">
              <CardContent className="text-destructive pt-5 text-sm">
                {error}
              </CardContent>
            </Card>
          ) : null}
        </aside>

        {/* ── Right main area: full-height timeline ──── */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Timeline ─ scrolls independently, full height */}
          <div className="pretty-scroll min-h-0 flex-1 overflow-y-auto">
            <div className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b px-6 py-3 backdrop-blur-sm">
              <div>
                <h3 className="text-sm font-semibold">{m.timeline_title()}</h3>
                <p className="text-muted-foreground text-xs">
                  {m.timeline_description()}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={historyBusy || undoStack.length === 0}
                  onClick={() => void onUndo()}
                >
                  {m.timeline_action_undo()}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={historyBusy || redoStack.length === 0}
                  onClick={() => void onRedo()}
                >
                  {m.timeline_action_redo()}
                </Button>
              </div>
            </div>
            <div className="p-4">
              {timelineItems.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-sm">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-8 w-8 opacity-30"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                  <p>{m.timeline_empty()}</p>
                </div>
              ) : (
                <ol className="border-primary/20 relative space-y-3 border-l-2 pl-5">
                  {timelineItems.map((item) => {
                    const collapsed = collapsedStepIds.includes(item.id)

                    return (
                      <li key={item.id} className="relative">
                        <span className="bg-primary ring-background absolute top-3.5 -left-[1.82rem] h-3 w-3 rounded-full ring-2" />

                        {item.type === 'prompt' ? (
                          <PromptTimelineCard
                            item={item}
                            collapsed={collapsed}
                            assetsMap={assetsMap}
                            missingReferenceIdsByStep={
                              missingReferenceIdsByStep
                            }
                            onToggleCollapsed={() =>
                              toggleStepCollapsed(item.id)
                            }
                            onDelete={() =>
                              onRequestDeleteTimelineStep(
                                item.sourceStepId,
                                m.timeline_prompt(),
                              )
                            }
                            onReusePrompt={() => onReusePrompt(item.input)}
                            onCopyText={onCopyText}
                          />
                        ) : item.type === 'generation' ? (
                          <GenerationTimelineCard
                            item={item}
                            collapsed={collapsed}
                            assetsMap={assetsMap}
                            settings={settings}
                            onToggleCollapsed={() =>
                              toggleStepCollapsed(item.id)
                            }
                            onDelete={() =>
                              onRequestDeleteTimelineStep(
                                item.sourceStepId,
                                m.timeline_generation_step(),
                              )
                            }
                            onRemixFrom={(assetId) =>
                              onRemixFrom(item, assetId)
                            }
                            onEditAsset={openEditorForAsset}
                            onExportAsset={(assetId) =>
                              void exportSingleAsset(assetId)
                            }
                            openLightbox={openLightbox}
                          />
                        ) : (
                          <EditTimelineCard
                            item={item}
                            collapsed={collapsed}
                            assetsMap={assetsMap}
                            settings={settings}
                            onToggleCollapsed={() =>
                              toggleStepCollapsed(item.id)
                            }
                            onDelete={() =>
                              onRequestDeleteTimelineStep(
                                item.step.id,
                                m.timeline_edit_step(),
                              )
                            }
                            onRemixFromAsset={onRemixFromAsset}
                            onEditAsset={openEditorForAsset}
                            onExportAsset={(assetId) =>
                              void exportSingleAsset(assetId)
                            }
                            openLightbox={openLightbox}
                          />
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ─── Dialogs ─────────────────────────────────────────────── */}
      <AlertDialog
        open={timelineStepPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTimelineStepPendingDelete(null)
        }}
      >
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.timeline_delete_confirm_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.timeline_delete_confirm_description({
                step: timelineStepPendingDelete?.label ?? m.common_unknown(),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_close()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void onConfirmDeleteTimelineStep()}
            >
              {m.timeline_action_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={projectIdPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setProjectIdPendingDelete(null)
        }}
      >
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogTitle>{m.project_delete()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.project_delete_confirm_description()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_close()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!projectIdPendingDelete) return
                const deletingProjectId = projectIdPendingDelete
                setProjectIdPendingDelete(null)
                await removeProjectAndRefresh(deletingProjectId)
                if (deletingProjectId === project.id) {
                  await navigate({ to: '/' })
                  return
                }
                if (cleanupStateVisible) await onLoadCleanup()
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
          if (!editorSourceAssetId) return
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
        onRenamePersona={async (personaId, name) =>
          await renamePersonaItem(personaId, name)
        }
        onDeletePersona={async (personaId) => {
          setSelectedPersonaIds((current) =>
            current.filter((id) => id !== personaId),
          )
          await removePersona(personaId)
        }}
        onAddPersonaImages={async (personaId, files) =>
          await addPersonaImages(personaId, files)
        }
        onRemovePersonaImage={async (assetId) =>
          await removePersonaImage(assetId)
        }
        onToggleSelectedPersona={(personaId) => {
          setSelectedPersonaIds((current) =>
            current.includes(personaId)
              ? current.filter((id) => id !== personaId)
              : [...current, personaId],
          )
        }}
        onOpenLightbox={(context) => openLightbox(context)}
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

/* ─── Timeline sub-components ──────────────────────────────────────── */

function PromptTimelineCard({
  item,
  collapsed,
  assetsMap,
  missingReferenceIdsByStep,
  onToggleCollapsed,
  onDelete,
  onReusePrompt,
  onCopyText,
}: {
  item: PromptTimelineItem
  collapsed: boolean
  assetsMap: Map<string, OutputAsset>
  missingReferenceIdsByStep: Map<string, string[]>
  onToggleCollapsed: () => void
  onDelete: () => void
  onReusePrompt: () => void
  onCopyText: (value: string) => Promise<void>
}) {
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">{m.timeline_prompt()}</CardTitle>
            <Badge variant="outline" className="text-[10px]">
              {formatDate(item.createdAt)}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="ghost" onClick={onReusePrompt}>
              {m.timeline_action_reuse_prompt()}
            </Button>
            <Button size="xs" variant="ghost" onClick={onDelete}>
              {m.timeline_action_delete()}
            </Button>
            <Button size="xs" variant="ghost" onClick={onToggleCollapsed}>
              {collapsed ? m.timeline_expand() : m.timeline_collapse()}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-2.5 overflow-hidden pt-0">
        {collapsed ? (
          <p className="text-muted-foreground truncate text-sm">
            {item.input.prompt}
          </p>
        ) : (
          <>
            <div className="rounded-lg bg-zinc-900/90 p-3 text-xs text-zinc-100 dark:bg-zinc-800/80">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] tracking-wider text-zinc-400 uppercase">
                  {m.timeline_prompt()}
                </p>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-6 border-zinc-500/40 text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100"
                  onClick={() => void onCopyText(item.input.prompt)}
                >
                  {m.timeline_action_copy_prompt()}
                </Button>
              </div>
              <p className="mt-1.5 leading-relaxed whitespace-pre-wrap">
                {item.input.prompt}
              </p>
            </div>

            {item.input.negativePrompt ? (
              <div className="rounded-lg bg-zinc-100 p-3 text-xs text-zinc-800 ring-1 ring-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-200 dark:ring-zinc-700">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                    {m.timeline_negative_prompt()}
                  </p>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-6"
                    onClick={() =>
                      void onCopyText(item.input.negativePrompt ?? '')
                    }
                  >
                    {m.timeline_action_copy_negative_prompt()}
                  </Button>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap">
                  {item.input.negativePrompt}
                </p>
              </div>
            ) : null}

            <p className="text-muted-foreground text-xs">
              {m.timeline_model_line({
                model: item.input.modelId,
                resolution: item.input.resolutionPreset,
                ratio: item.input.aspectRatio,
              })}
            </p>

            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground text-xs">
                {m.timeline_references_label()}:
              </span>
              {item.input.referenceAssetIds.length === 0 ? (
                <Badge variant="outline">{m.timeline_references_none()}</Badge>
              ) : (
                item.input.referenceAssetIds.map((assetId) => {
                  const missingReferences = missingReferenceIdsByStep.get(
                    item.id,
                  )
                  const isDeleted = missingReferences
                    ? missingReferences.includes(assetId)
                    : !assetsMap.has(assetId)
                  return (
                    <Badge
                      key={assetId}
                      variant={isDeleted ? 'destructive' : 'outline'}
                    >
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
  )
}

function GenerationTimelineCard({
  item,
  collapsed,
  assetsMap,
  settings,
  onToggleCollapsed,
  onDelete,
  onRemixFrom,
  onEditAsset,
  onExportAsset,
  openLightbox,
}: {
  item: GenerationTimelineItem
  collapsed: boolean
  assetsMap: Map<string, OutputAsset>
  settings: { nerdMode: boolean }
  onToggleCollapsed: () => void
  onDelete: () => void
  onRemixFrom: (assetId: string) => void
  onEditAsset: (assetId: string) => void
  onExportAsset: (assetId: string) => void
  openLightbox: (context: LightboxContext) => void
}) {
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">
              {m.timeline_generation_step()}
            </CardTitle>
            {item.trace?.fallbackUsed ? (
              <Badge variant="outline">{m.timeline_fallback_badge()}</Badge>
            ) : null}
            {item.status === 'pending' ? (
              <Badge variant="outline" className="animate-pulse">
                {m.generation_button_busy()}
              </Badge>
            ) : null}
            <Badge variant="outline" className="text-[10px]">
              {formatDate(item.createdAt)}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="ghost" onClick={onDelete}>
              {m.timeline_action_delete()}
            </Button>
            <Button size="xs" variant="ghost" onClick={onToggleCollapsed}>
              {collapsed ? m.timeline_expand() : m.timeline_collapse()}
            </Button>
          </div>
        </div>
        {!collapsed ? (
          <p className="text-muted-foreground text-xs">
            {m.timeline_model_line({
              model: item.input.modelId,
              resolution: item.input.resolutionPreset,
              ratio: item.input.aspectRatio,
            })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="min-w-0 space-y-3 overflow-hidden pt-0">
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
            {Array.from({
              length: Math.max(1, item.input.outputCount),
            }).map((_, index) => (
              <div
                key={`${item.id}:skeleton:${index}`}
                className="overflow-hidden rounded-xl border p-1.5"
              >
                <div className="bg-muted h-44 animate-pulse rounded-lg" />
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
              if (!asset) return null

              return (
                <div
                  key={output.assetId}
                  className="group border-border/50 overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="bg-muted/10 relative w-full cursor-zoom-in overflow-hidden"
                    style={{
                      aspectRatio: `${asset.width} / ${asset.height}`,
                    }}
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
                      if (event.key !== 'Enter' && event.key !== ' ') return
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
                    <div className="absolute inset-0 flex items-start justify-end gap-1 bg-gradient-to-t from-black/20 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="xs"
                        variant="secondary"
                        className="shadow-sm"
                        onClick={(event) => {
                          event.stopPropagation()
                          onRemixFrom(output.assetId)
                        }}
                      >
                        {m.timeline_action_remix()}
                      </Button>
                      <Button
                        size="xs"
                        variant="secondary"
                        className="shadow-sm"
                        onClick={(event) => {
                          event.stopPropagation()
                          onEditAsset(output.assetId)
                        }}
                      >
                        {m.timeline_action_edit()}
                      </Button>
                      <Button
                        size="xs"
                        variant="secondary"
                        className="shadow-sm"
                        onClick={(event) => {
                          event.stopPropagation()
                          onExportAsset(output.assetId)
                        }}
                      >
                        {m.timeline_action_jpg()}
                      </Button>
                    </div>
                  </div>

                  {!collapsed ? (
                    <div className="px-3 py-2">
                      <p className="text-muted-foreground text-[11px]">
                        {outputIndex + 1}. {asset.width}x{asset.height} &middot;{' '}
                        {asset.mimeType}
                      </p>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {item.status === 'failed' ? (
          <p className="text-destructive rounded-lg bg-red-50 p-2 text-xs dark:bg-red-950/30">
            {m.generation_status_failed()}
          </p>
        ) : null}

        {!collapsed && settings.nerdMode ? (
          <div className="bg-muted/30 rounded-lg p-3 font-mono text-[11px] leading-relaxed">
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
            {item.trace?.fallbackUsed ? (
              <p>{m.timeline_nerd_fallback_used()}</p>
            ) : null}
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
  )
}

function EditTimelineCard({
  item,
  collapsed,
  assetsMap,
  settings,
  onToggleCollapsed,
  onDelete,
  onRemixFromAsset,
  onEditAsset,
  onExportAsset,
  openLightbox,
}: {
  item: EditTimelineItem
  collapsed: boolean
  assetsMap: Map<string, OutputAsset>
  settings: { nerdMode: boolean }
  onToggleCollapsed: () => void
  onDelete: () => void
  onRemixFromAsset: (assetId: string) => void
  onEditAsset: (assetId: string) => void
  onExportAsset: (assetId: string) => void
  openLightbox: (context: LightboxContext) => void
}) {
  const sourceAsset = assetsMap.get(item.step.sourceAssetId)
  const outputAsset = assetsMap.get(item.step.outputAssetId)

  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">{m.timeline_edit_step()}</CardTitle>
            <Badge variant="outline" className="text-[10px]">
              {formatDate(item.step.createdAt)}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="ghost" onClick={onDelete}>
              {m.timeline_action_delete()}
            </Button>
            <Button size="xs" variant="ghost" onClick={onToggleCollapsed}>
              {collapsed ? m.timeline_expand() : m.timeline_collapse()}
            </Button>
          </div>
        </div>
        {collapsed ? null : (
          <CardDescription className="text-xs">
            {m.timeline_edit_description()}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="grid gap-3 pt-0 md:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
            {m.timeline_source()}
          </p>
          {sourceAsset ? (
            <button
              type="button"
              className="bg-muted/10 w-full overflow-hidden rounded-xl"
              style={{
                aspectRatio: `${sourceAsset.width} / ${sourceAsset.height}`,
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
              <AssetThumb asset={sourceAsset} alt={m.timeline_source()} />
            </button>
          ) : (
            <div className="bg-muted text-muted-foreground flex h-40 items-center justify-center rounded-xl text-xs">
              {m.timeline_missing_source()}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
            {m.timeline_output()}
          </p>
          {outputAsset ? (
            <button
              type="button"
              className="bg-muted/10 w-full overflow-hidden rounded-xl"
              style={{
                aspectRatio: `${outputAsset.width} / ${outputAsset.height}`,
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
              <AssetThumb asset={outputAsset} alt={m.timeline_output()} />
            </button>
          ) : (
            <div className="bg-muted text-muted-foreground flex h-40 items-center justify-center rounded-xl text-xs">
              {m.timeline_missing_output()}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
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
              onClick={() => onEditAsset(item.step.outputAssetId)}
            >
              {m.timeline_action_edit()}
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => onExportAsset(item.step.outputAssetId)}
            >
              {m.timeline_export_jpg()}
            </Button>
          </div>
        </div>
        {!collapsed && settings.nerdMode ? (
          <div className="bg-muted/30 col-span-full rounded-lg p-3 font-mono text-[11px] leading-relaxed">
            <p>{m.timeline_nerd_step_id({ id: item.step.id })}</p>
            <p>
              {m.timeline_nerd_rotate({
                value: String(item.step.operations.rotate),
              })}
            </p>
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
            <p>
              {m.timeline_nerd_blur({
                value: String(item.step.operations.blur),
              })}
            </p>
            <p>
              {m.timeline_nerd_sharpen({
                value: String(item.step.operations.sharpen),
              })}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

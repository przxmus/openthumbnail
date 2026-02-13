import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  EditOperations,
  GenerationStep,
  ModelCapability,
  OutputAsset,
  Persona,
  Project,
  QuotaCleanupState,
  TimelineStep,
} from '@/types/workshop'
import {
  DEFAULT_OUTPUT_COUNT,
  MAX_PERSONA_REFERENCES,
  getResolutionPresetConfig,
} from '@/lib/constants/workshop'
import { exportAssetAsJpg, exportAssetsAsZip } from '@/lib/services/export'
import { applyImageEdits, downloadBlob, readImageDimensions } from '@/lib/services/image-utils'
import { newId } from '@/lib/services/ids'
import { listOpenRouterImageModels } from '@/lib/services/model-catalog'
import { runGeneration } from '@/lib/services/generation'
import { extractYoutubeVideoId, fetchBestYoutubeThumbnail } from '@/lib/services/youtube'
import {
  appendStep,
  collectCleanupCandidates,
  collectUsageForPersona,
  deletePersona,
  deletePersonaReferenceAsset,
  deleteProject,
  deleteReferenceAsset,
  exportProjectBackup,
  getAsset,
  getAssets,
  getPersona,
  getProjectAssets,
  getProjectById,
  getProjectSteps,
  importProjectBackup,
  listPersonas,
  renamePersona,
  setPersonaReferenceAssetIds,
  touchProject,
  updateProject,
  upsertAsset,
  upsertPersona,
} from '@/lib/storage/repository'
import { ensureSchemaVersion } from '@/lib/storage/db'
import { loadSettings, saveSettings } from '@/lib/storage/settings'

interface GenerateStepParams {
  modelId: string
  prompt: string
  negativePrompt: string
  referenceAssetIds: Array<string>
  personaIds: Array<string>
  aspectRatio: Project['defaultAspectRatio']
  resolutionPreset: Project['defaultResolution']
  outputCount: number
  remixOfStepId?: string
  remixOfAssetId?: string
  modelCapability?: ModelCapability
}

function isQuotaCleanupState(value: unknown): value is QuotaCleanupState {
  if (!value || typeof value !== 'object') {
    return false
  }

  return 'reason' in value && typeof value.reason === 'string'
}

function byStepOrder(a: TimelineStep, b: TimelineStep) {
  return a.createdAt - b.createdAt
}

function mergeAssets(
  current: Array<OutputAsset>,
  incoming: Array<OutputAsset>,
) {
  const map = new Map<string, OutputAsset>()

  for (const asset of current) {
    map.set(asset.id, asset)
  }

  for (const asset of incoming) {
    map.set(asset.id, asset)
  }

  return Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt)
}

function removeAssets(current: Array<OutputAsset>, assetIds: Array<string>) {
  const blocked = new Set(assetIds)
  return current.filter((asset) => !blocked.has(asset.id))
}

function mergePersonas(
  current: Array<Persona>,
  incoming: Array<Persona>,
) {
  const map = new Map<string, Persona>()
  for (const persona of current) {
    map.set(persona.id, persona)
  }

  for (const persona of incoming) {
    map.set(persona.id, persona)
  }

  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function useWorkshopProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null)
  const [steps, setSteps] = useState<Array<TimelineStep>>([])
  const [assets, setAssets] = useState<Array<OutputAsset>>([])
  const [personas, setPersonas] = useState<Array<Persona>>([])
  const [models, setModels] = useState<Array<ModelCapability>>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quotaState, setQuotaState] = useState<QuotaCleanupState | null>(null)
  const didLoadRef = useRef(false)

  const settings = useMemo(() => loadSettings(), [projectId])

  const reload = useCallback(async (options?: { preserveScroll?: boolean }) => {
    const preserveScroll = options?.preserveScroll ?? false
    const scrollY =
      preserveScroll && typeof window !== 'undefined' ? window.scrollY : null

    if (!didLoadRef.current) {
      setLoading(true)
    }

    try {
      await ensureSchemaVersion()
      const [projectValue, stepsValue, projectAssets, personasValue] = await Promise.all([
        getProjectById(projectId),
        getProjectSteps(projectId),
        getProjectAssets(projectId),
        listPersonas(),
      ])

      const personaAssetIds = Array.from(
        new Set(personasValue.flatMap((persona) => persona.referenceAssetIds)),
      )
      const personaAssets = personaAssetIds.length ? await getAssets(personaAssetIds) : []
      const allAssets = [...projectAssets, ...personaAssets]

      setProject(projectValue ?? null)
      setSteps(stepsValue.sort(byStepOrder))
      setAssets(allAssets)
      setPersonas(personasValue)
      setError(null)

      if (projectValue) {
        await touchProject(projectValue.id)
      }

      if (settings.openRouterApiKey) {
        const modelList = await listOpenRouterImageModels(settings.openRouterApiKey)
        setModels(modelList)
      } else {
        setModels([])
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load project data')
    } finally {
      didLoadRef.current = true
      setLoading(false)

      if (scrollY !== null && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          window.scrollTo({
            top: scrollY,
            behavior: 'auto',
          })
        })
      }
    }
  }, [projectId, settings.openRouterApiKey])

  useEffect(() => {
    void reload()
  }, [reload])

  const assetsMap = useMemo(() => {
    const map = new Map<string, OutputAsset>()

    for (const asset of assets) {
      map.set(asset.id, asset)
    }

    return map
  }, [assets])

  const referenceAssets = useMemo(
    () => assets.filter((asset) => asset.kind === 'reference' || asset.kind === 'imported'),
    [assets],
  )

  const outputAssets = useMemo(
    () => assets.filter((asset) => asset.kind === 'generated' || asset.kind === 'edited'),
    [assets],
  )

  const updateProjectDefaults = useCallback(
    async (patch: Partial<Project>) => {
      if (!project) {
        return
      }

      const updated = await updateProject(project.id, patch)
      setProject(updated)
    },
    [project],
  )

  const storeReferenceFile = useCallback(
    async (file: Blob, kind: OutputAsset['kind']) => {
      if (!project) {
        throw new Error('Project not loaded')
      }

      const dimensions = await readImageDimensions(file)
      const asset: OutputAsset = {
        id: newId('asset'),
        scope: 'project',
        projectId: project.id,
        kind,
        createdAt: Date.now(),
        mimeType: file.type || 'image/png',
        width: dimensions.width,
        height: dimensions.height,
        blob: file,
      }

      await upsertAsset(asset)
      setAssets((current) => mergeAssets(current, [asset]))
      return asset
    },
    [project],
  )

  const uploadReferenceFiles = useCallback(
    async (files: Array<File>) => {
      if (!files.length) {
        return
      }

      setBusy(true)
      setQuotaState(null)
      setError(null)

      try {
        for (const file of files) {
          await storeReferenceFile(file, 'reference')
        }
      } catch (reason) {
        if (isQuotaCleanupState(reason)) {
          setQuotaState(reason)
        } else {
          setError(reason instanceof Error ? reason.message : 'Failed to save references')
        }
      } finally {
        setBusy(false)
      }
    },
    [storeReferenceFile],
  )

  const importYoutubeThumbnail = useCallback(
    async (youtubeUrl: string) => {
      if (!youtubeUrl.trim()) {
        throw new Error('YouTube URL is required')
      }

      const videoId = extractYoutubeVideoId(youtubeUrl)
      if (!videoId) {
        throw new Error('Unsupported YouTube URL format')
      }

      setBusy(true)
      setQuotaState(null)
      setError(null)

      try {
        const thumbnail = await fetchBestYoutubeThumbnail(videoId)
        const asset = await storeReferenceFile(thumbnail.blob, 'imported')

        const updatedAsset = {
          ...asset,
          sourceUrl: thumbnail.sourceUrl,
        }

        await upsertAsset(updatedAsset)
        setAssets((current) => mergeAssets(current, [updatedAsset]))
      } catch (reason) {
        if (isQuotaCleanupState(reason)) {
          setQuotaState(reason)
        } else {
          setError(reason instanceof Error ? reason.message : 'Failed to import YouTube thumbnail')
          throw reason
        }
      } finally {
        setBusy(false)
      }
    },
    [storeReferenceFile],
  )

  const createPersona = useCallback(
    async (name: string) => {
      const normalizedName = name.trim()
      if (!normalizedName) {
        throw new Error('Persona name cannot be empty')
      }

      const persona: Persona = {
        id: newId('persona'),
        name: normalizedName,
        referenceAssetIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      await upsertPersona(persona)
      setPersonas((current) => mergePersonas(current, [persona]))
      return persona
    },
    [],
  )

  const renamePersonaItem = useCallback(
    async (personaId: string, nextName: string) => {
      const normalized = nextName.trim()
      if (!normalized) {
        throw new Error('Persona name cannot be empty')
      }

      const nextPersona = await renamePersona(personaId, normalized)
      setPersonas((current) => mergePersonas(current, [nextPersona]))
    },
    [],
  )

  const addPersonaImages = useCallback(
    async (personaId: string, files: Array<File>) => {
      if (!files.length) {
        return
      }

      const persona =
        personas.find((entry) => entry.id === personaId) ?? (await getPersona(personaId))
      if (!persona) {
        throw new Error('Persona not found')
      }

      const remainingSlots = MAX_PERSONA_REFERENCES - persona.referenceAssetIds.length
      if (remainingSlots <= 0) {
        throw new Error('Persona reached the limit of 4 images')
      }

      const selected = files.slice(0, remainingSlots)
      const newAssets: Array<OutputAsset> = []
      const newAssetIds: Array<string> = []

      for (const file of selected) {
        const dimensions = await readImageDimensions(file)
        const asset: OutputAsset = {
          id: newId('asset'),
          scope: 'global',
          projectId: null,
          kind: 'persona',
          createdAt: Date.now(),
          mimeType: file.type || 'image/png',
          width: dimensions.width,
          height: dimensions.height,
          blob: file,
        }

        await upsertAsset(asset)
        newAssets.push(asset)
        newAssetIds.push(asset.id)
      }

      const updatedPersona = await setPersonaReferenceAssetIds(personaId, [
        ...persona.referenceAssetIds,
        ...newAssetIds,
      ])

      setAssets((current) => mergeAssets(current, newAssets))
      setPersonas((current) => mergePersonas(current, [updatedPersona]))
    },
    [personas],
  )

  const removePersonaImage = useCallback(
    async (assetId: string) => {
      await deletePersonaReferenceAsset(assetId)
      setAssets((current) => removeAssets(current, [assetId]))
      setPersonas((current) =>
        current.map((persona) =>
          persona.referenceAssetIds.includes(assetId)
            ? {
                ...persona,
                referenceAssetIds: persona.referenceAssetIds.filter((id) => id !== assetId),
                updatedAt: Date.now(),
              }
            : persona,
        ),
      )
    },
    [],
  )

  const removePersona = useCallback(
    async (personaId: string) => {
      const persona = personas.find((entry) => entry.id === personaId)
      await deletePersona(personaId)
      setPersonas((current) => current.filter((entry) => entry.id !== personaId))

      if (!persona) {
        return
      }

      const remainingAssetIds = new Set(
        personas
          .filter((entry) => entry.id !== personaId)
          .flatMap((entry) => entry.referenceAssetIds),
      )

      const removedAssetIds = persona.referenceAssetIds.filter(
        (assetId) => !remainingAssetIds.has(assetId),
      )

      if (removedAssetIds.length) {
        setAssets((current) => removeAssets(current, removedAssetIds))
      }
    },
    [personas],
  )

  const generateStep = useCallback(
    async (params: GenerateStepParams) => {
      if (!project) {
        throw new Error('Project not loaded')
      }

      const apiKey = settings.openRouterApiKey.trim()
      if (!apiKey) {
        throw new Error('OpenRouter API key is not configured')
      }

      const prompt = params.prompt.trim()
      if (!prompt) {
        throw new Error('Prompt is required')
      }

      const model = params.modelCapability
      const supportsReferences = model?.supportsReferences ?? false
      const supportsNegativePrompt = model?.supportsNegativePrompt ?? false
      const maxOutputs = model?.maxOutputs ?? 1

      const outputCount = Math.max(
        1,
        Math.min(params.outputCount || DEFAULT_OUTPUT_COUNT, maxOutputs || 1),
      )

      const referenceAssetIds = supportsReferences ? params.referenceAssetIds : []
      const negativePrompt = supportsNegativePrompt ? params.negativePrompt.trim() : ''

      const references = await getAssets(referenceAssetIds)
      const selectedPersonas = personas.filter((persona) =>
        params.personaIds.includes(persona.id),
      )

      const personaReferenceIds = selectedPersonas
        .flatMap((persona) => persona.referenceAssetIds)
        .filter((assetId) => !referenceAssetIds.includes(assetId))

      const personaAssets = await getAssets(personaReferenceIds)
      const allReferences = [...references, ...personaAssets]

      const resolution = getResolutionPresetConfig(
        params.resolutionPreset,
        params.aspectRatio,
      )

      setBusy(true)
      setError(null)
      setQuotaState(null)

      try {
        const generation = await runGeneration({
          apiKey,
          input: {
            modelId: params.modelId,
            prompt,
            negativePrompt,
            referenceAssetIds,
            personaIds: params.personaIds,
            aspectRatio: params.aspectRatio,
            resolutionPreset: params.resolutionPreset,
            outputCount,
          },
          resolution,
          references: allReferences,
          personas: selectedPersonas,
          personaAssets,
          includeTrace: settings.nerdMode,
        })

        const outputs: GenerationStep['outputs'] = []

        for (const output of generation.outputs) {
          const asset: OutputAsset = {
            id: newId('asset'),
            scope: 'project',
            projectId: project.id,
            kind: 'generated',
            createdAt: Date.now(),
            mimeType: output.mimeType,
            width: output.width,
            height: output.height,
            sourceUrl: output.providerUrl,
            blob: output.blob,
          }

          await upsertAsset(asset)

          outputs.push({
            assetId: asset.id,
            originalMimeType: output.mimeType,
            width: output.width,
            height: output.height,
            providerUrl: output.providerUrl,
            revisedPrompt: output.revisedPrompt,
          })
        }

        const step: GenerationStep = {
          id: newId('step'),
          projectId: project.id,
          type: 'generation',
          createdAt: Date.now(),
          input: {
            modelId: params.modelId,
            prompt,
            negativePrompt,
            referenceAssetIds,
            personaIds: params.personaIds,
            aspectRatio: params.aspectRatio,
            resolutionPreset: params.resolutionPreset,
            outputCount,
          },
          outputs,
          remixOfStepId: params.remixOfStepId,
          remixOfAssetId: params.remixOfAssetId,
          status: 'completed',
          trace: generation.trace,
        }

        await appendStep(step)

        await updateProjectDefaults({
          defaultModel: params.modelId,
          defaultAspectRatio: params.aspectRatio,
          defaultResolution: params.resolutionPreset,
        })

        const updatedSettings = {
          ...settings,
          lastUsedModel: params.modelId,
        }

        saveSettings(updatedSettings)

        await reload({ preserveScroll: true })
      } catch (reason) {
        if (isQuotaCleanupState(reason)) {
          setQuotaState(reason)
        } else {
          setError(reason instanceof Error ? reason.message : 'Generation failed')
        }

        throw reason
      } finally {
        setBusy(false)
      }
    },
    [personas, project, reload, settings, updateProjectDefaults],
  )

  const createEditStep = useCallback(
    async (sourceAssetId: string, operations: EditOperations) => {
      if (!project) {
        throw new Error('Project not loaded')
      }

      const source = await getAsset(sourceAssetId)
      if (!source) {
        throw new Error('Source asset not found')
      }

      setBusy(true)
      setQuotaState(null)

      try {
        const edited = await applyImageEdits(source.blob, operations)

        const editedAsset: OutputAsset = {
          id: newId('asset'),
          scope: 'project',
          projectId: project.id,
          kind: 'edited',
          createdAt: Date.now(),
          mimeType: edited.blob.type || source.mimeType,
          width: edited.width,
          height: edited.height,
          blob: edited.blob,
        }

        await upsertAsset(editedAsset)

        await appendStep({
          id: newId('step'),
          projectId: project.id,
          type: 'edit',
          createdAt: Date.now(),
          sourceAssetId,
          outputAssetId: editedAsset.id,
          operations,
        })

        await reload({ preserveScroll: true })
      } catch (reason) {
        if (isQuotaCleanupState(reason)) {
          setQuotaState(reason)
        } else {
          setError(reason instanceof Error ? reason.message : 'Unable to apply edits')
        }

        throw reason
      } finally {
        setBusy(false)
      }
    },
    [project, reload],
  )

  const exportSingleAsset = useCallback(async (assetId: string) => {
    const asset = await getAsset(assetId)
    if (!asset) {
      throw new Error('Asset not found')
    }

    const jpg = await exportAssetAsJpg(asset)
    downloadBlob(jpg.blob, jpg.filename)
  }, [])

  const exportProjectBatch = useCallback(async () => {
    if (!project) {
      return
    }

    const bundle = await exportAssetsAsZip(project.name, outputAssets)
    downloadBlob(bundle.blob, bundle.filename)
  }, [outputAssets, project])

  const exportBackup = useCallback(async () => {
    if (!project) {
      return
    }

    const backup = await exportProjectBackup(project.id)
    downloadBlob(backup.blob, backup.filename)
  }, [project])

  const importBackup = useCallback(
    async (file: File) => {
      const importedProject = await importProjectBackup(file)
      await reload({ preserveScroll: true })
      return importedProject
    },
    [reload],
  )

  const cleanupCandidates = useCallback(async () => {
    return collectCleanupCandidates()
  }, [])

  const removeProjectAndRefresh = useCallback(
    async (id: string) => {
      await deleteProject(id)
      await reload({ preserveScroll: true })
    },
    [reload],
  )

  const personaUsage = useCallback(async (persona: Persona) => {
    return collectUsageForPersona(persona)
  }, [])

  const removeReferenceImage = useCallback(
    async (assetId: string) => {
      await deleteReferenceAsset(assetId)
      setAssets((current) => removeAssets(current, [assetId]))
    },
    [],
  )

  const missingReferenceIdsByStep = useMemo(() => {
    const missingByStep = new Map<string, Array<string>>()

    for (const step of steps) {
      if (step.type !== 'generation') {
        continue
      }

      const missing = step.input.referenceAssetIds.filter(
        (assetId) => !assetsMap.has(assetId),
      )

      if (missing.length) {
        missingByStep.set(step.id, missing)
      }
    }

    return missingByStep
  }, [assetsMap, steps])

  return {
    loading,
    busy,
    error,
    project,
    steps,
    assets,
    assetsMap,
    referenceAssets,
    outputAssets,
    personas,
    models,
    quotaState,
    settings,
    reload,
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
    personaUsage,
    missingReferenceIdsByStep,
  }
}

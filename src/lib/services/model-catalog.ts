import { OpenRouter } from '@openrouter/sdk'
import { createServerFn } from '@tanstack/react-start'

import type { ModelCapability } from '@/types/workshop'

const CACHE_KEY = 'openthumbnail.model-catalog.v2'
const CACHE_TTL_MS = 1000 * 60 * 10
const OPENROUTER_FRONTEND_IMAGE_MODELS_URL =
  'https://openrouter.ai/api/frontend/models/find?fmt=cards&input_modalities=image%2Ctext&output_modalities=image'

interface CachePayload {
  fetchedAt: number
  models: Array<ModelCapability>
}

interface OpenRouterFrontendModel {
  slug: string
  name: string
  description?: string
  hidden?: boolean
  output_modalities?: Array<string>
  input_modalities?: Array<string>
  endpoint?: {
    is_hidden?: boolean
    is_disabled?: boolean
    has_chat_completions?: boolean
  }
}

interface OpenRouterFrontendModelsResponse {
  models?: Array<OpenRouterFrontendModel>
  data?: {
    models?: Array<OpenRouterFrontendModel>
  }
}

function parseCache() {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(CACHE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as CachePayload
  } catch {
    return null
  }
}

function saveCache(models: Array<ModelCapability>) {
  if (typeof window === 'undefined') {
    return
  }

  const payload: CachePayload = {
    fetchedAt: Date.now(),
    models,
  }

  window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
}

const getFrontendImageModels = createServerFn({ method: 'GET' }).handler(async () => {
  const response = await fetch(OPENROUTER_FRONTEND_IMAGE_MODELS_URL, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`OpenRouter frontend models request failed with ${response.status}`)
  }

  const payload = (await response.json()) as OpenRouterFrontendModelsResponse
  const entries = payload.models ?? payload.data?.models ?? []

  return entries
})

function isLikelyNegativePromptCapable(model: {
  id?: string
  slug?: string
  name: string
  description?: string
}) {
  const text = `${model.id ?? model.slug ?? ''} ${model.name} ${model.description ?? ''}`.toLowerCase()
  return /(flux|stable|sd|imagen|ideogram|recraft|playground|image)/.test(text)
}

function isImageGenerationModel(model: {
  id: string
  name: string
  description?: string
  architecture?: {
    modality?: string | null
    outputModalities?: Array<string>
    inputModalities?: Array<string>
  }
}) {
  const outputModalities = model.architecture?.outputModalities ?? []
  if (outputModalities.includes('image')) {
    return true
  }

  const architectureModality = (model.architecture?.modality ?? '').toLowerCase()
  if (architectureModality === 'image') {
    return true
  }
  return false
}

export function getCachedModelCatalog() {
  const cache = parseCache()
  if (!cache) {
    return null
  }

  if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    return null
  }

  return cache.models
}

export async function listOpenRouterImageModels(apiKey: string) {
  const cached = parseCache()
  const client = new OpenRouter({ apiKey })

  try {
    const frontendModels = await getFrontendImageModels()

    const models = frontendModels
      .filter((model) => !model.hidden)
      .filter((model) => !model.endpoint?.is_hidden && !model.endpoint?.is_disabled)
      .filter((model) => (model.output_modalities ?? []).includes('image'))
      .map<ModelCapability>((model) => ({
        id: model.slug,
        name: model.name,
        supportsImages: true,
        supportsReferences: (model.input_modalities ?? []).includes('image'),
        supportsNegativePrompt: isLikelyNegativePromptCapable(model),
        maxOutputs: undefined,
        availability: 'available',
        description: model.description,
        supportsChatCompletions: model.endpoint?.has_chat_completions,
        catalogSource: 'frontend',
      }))
      .filter((model) => model.id.length > 0 && model.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))

    if (models.length > 0) {
      saveCache(models)
      return models
    }
  } catch {
    // fallback below
  }

  try {
    const response = await client.models.list()
    const now = Date.now()

    const models = response.data
      .filter((model) => isImageGenerationModel(model))
      .map<ModelCapability>((model) => {
        const expired = Boolean(
          model.expirationDate && new Date(model.expirationDate).getTime() < now,
        )

        return {
          id: model.id,
          name: model.name,
          supportsImages: true,
          supportsReferences: model.architecture.inputModalities.includes('image'),
          supportsNegativePrompt: isLikelyNegativePromptCapable(model),
          maxOutputs: undefined,
          availability: expired ? 'unavailable' : 'available',
          description: model.description,
          catalogSource: 'v1',
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    saveCache(models)
    return models
  } catch (error) {
    if (cached && cached.models.length) {
      return cached.models.map((model) => ({
        ...model,
        catalogSource: model.catalogSource ?? 'cache',
      }))
    }

    throw error
  }
}

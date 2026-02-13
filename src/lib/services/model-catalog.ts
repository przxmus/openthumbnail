import { OpenRouter } from '@openrouter/sdk'

import type { ModelCapability } from '@/types/workshop'

const CACHE_KEY = 'openthumbnail.model-catalog.v1'
const CACHE_TTL_MS = 1000 * 60 * 30

interface CachePayload {
  fetchedAt: number
  models: Array<ModelCapability>
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

function isLikelyNegativePromptCapable(model: {
  id: string
  name: string
  description?: string
}) {
  const text = `${model.id} ${model.name} ${model.description ?? ''}`.toLowerCase()
  return /(flux|stable|sd|imagen|ideogram|recraft|playground|image)/.test(text)
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
  const cached = getCachedModelCatalog()

  if (cached) {
    return cached
  }

  const client = new OpenRouter({ apiKey })
  const response = await client.models.list()

  const now = Date.now()

  const models = response.data
    .filter((model) => model.architecture.outputModalities.includes('image'))
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
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  saveCache(models)
  return models
}

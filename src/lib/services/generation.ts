import { generateImage } from '@tanstack/ai'

import type {
  GenerationRequest,
  GenerationResult,
  OutputAsset,
  Persona,
} from '@/types/workshop'
import { blobToDataUrl, resolveGeneratedImageBlob } from '@/lib/services/image-utils'
import { openThumbnailOpenRouterImage } from '@/lib/services/openrouter-image-adapter'

function buildPrompt(
  prompt: string,
  references: Array<OutputAsset>,
  personas: Array<Persona>,
): string {
  if (!references.length && !personas.length) {
    return prompt
  }

  const personaContext = personas.length
    ? `\n\nPersonas selected: ${personas.map((persona) => persona.name).join(', ')}.`
    : ''

  const referenceContext = references.length
    ? `\n\nReference images attached: ${references.length}. Match composition/style cues while keeping originality.`
    : ''

  return `${prompt}${personaContext}${referenceContext}`
}

function parseProviderUrl(url: string | undefined) {
  if (!url) {
    return undefined
  }

  if (url.startsWith('data:')) {
    return undefined
  }

  return url
}

export async function runGeneration(request: GenerationRequest): Promise<GenerationResult> {
  const adapter = openThumbnailOpenRouterImage(request.apiKey, request.input.modelId)

  const supportsReferences = request.references.length > 0

  const referenceDataUrls = supportsReferences
    ? await Promise.all(request.references.map((reference) => blobToDataUrl(reference.blob)))
    : []

  const prompt = buildPrompt(request.input.prompt, request.references, request.personas)

  const startedAt = Date.now()

  const result = await generateImage({
    adapter,
    prompt,
    numberOfImages: request.input.outputCount,
    size: `${request.resolution.width}x${request.resolution.height}`,
    modelOptions: {
      negativePrompt: request.input.negativePrompt,
      referenceDataUrls,
    },
  })

  const finishedAt = Date.now()

  const outputs = await Promise.all(
    result.images.map(async (image) => {
      const blob = await resolveGeneratedImageBlob(image)
      const mimeType = blob.type || 'image/png'

      return {
        blob,
        mimeType,
        width: request.resolution.width,
        height: request.resolution.height,
        providerUrl: parseProviderUrl(image.url),
        revisedPrompt: image.revisedPrompt,
      }
    }),
  )

  return {
    outputs,
    trace: request.includeTrace
      ? {
          requestAt: startedAt,
          finishedAt,
          requestPayload: {
            model: request.input.modelId,
            outputCount: request.input.outputCount,
            aspectRatio: request.input.aspectRatio,
            resolution: request.input.resolutionPreset,
            hasNegativePrompt: Boolean(request.input.negativePrompt),
            references: request.input.referenceAssetIds.length,
          },
          responsePayload: {
            resultId: result.id,
            model: result.model,
            images: result.images.length,
          },
        }
      : undefined,
  }
}

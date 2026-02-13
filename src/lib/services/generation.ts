import { generateImage } from '@tanstack/ai'

import type {
  GenerationAttemptTrace,
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
  remixActive: boolean,
): string {
  if (!references.length && !personas.length && !remixActive) {
    return prompt
  }

  const personaContext = personas.length
    ? `\n\nPersonas selected: ${personas.map((persona) => persona.name).join(', ')}.`
    : ''

  const referenceContext = references.length
    ? `\n\nReference images attached: ${references.length}. Match composition/style cues while keeping originality.`
    : ''

  const remixContext = remixActive
    ? '\n\nRemix mode: prioritize the first attached reference as the primary composition anchor. Keep subject identity and layout close unless explicitly changed by prompt.'
    : ''

  return `${prompt}${personaContext}${referenceContext}${remixContext}`
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

function isStackOverflowError(reason: unknown) {
  if (!(reason instanceof Error)) {
    return false
  }

  if (reason.name === 'RangeError') {
    return true
  }

  return reason.message.toLowerCase().includes('maximum call stack size exceeded')
}

function normalizeGenerationError(reason: unknown) {
  if (isStackOverflowError(reason)) {
    return new Error(
      'The selected model failed in standard mode due to a provider compatibility issue. Compatibility fallback also failed. Try another model or simplify the request.',
    )
  }

  if (reason instanceof Error) {
    return new Error(reason.message || 'Image generation failed')
  }

  return new Error('Image generation failed')
}

async function toOutputs(
  images: Array<{ url?: string; b64Json?: string; revisedPrompt?: string }>,
  request: GenerationRequest,
) {
  return Promise.all(
    images.map(async (image) => {
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
}

async function hashBlob(blob: Blob) {
  if (typeof crypto === 'undefined') {
    return null
  }

  try {
    const buffer = await blob.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    const bytes = new Uint8Array(digest)
    return Array.from(bytes)
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

async function dedupeOutputsByContent(
  outputs: Array<{
    blob: Blob
    mimeType: string
    width: number
    height: number
    providerUrl?: string
    revisedPrompt?: string
  }>,
) {
  const seen = new Set<string>()
  const unique: typeof outputs = []

  for (const output of outputs) {
    const hash = await hashBlob(output.blob)
    const key = hash ?? `${output.providerUrl ?? 'blob'}:${output.blob.size}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    unique.push(output)
  }

  return unique
}

export async function runGeneration(request: GenerationRequest): Promise<GenerationResult> {
  const adapter = openThumbnailOpenRouterImage(request.apiKey, request.input.modelId)

  const referenceDataUrls = request.references.length
    ? await Promise.all(request.references.map((reference) => blobToDataUrl(reference.blob)))
    : []

  const prompt = buildPrompt(
    request.input.prompt,
    request.references,
    request.personas,
    Boolean(request.remixOfAssetId),
  )
  const startedAt = Date.now()
  const attempts: Array<GenerationAttemptTrace> = []

  const runAttempt = async (params: {
    mode: 'standard' | 'compatibility'
    promptText: string
    numberOfImages: number
    negativePrompt?: string
    references?: Array<string>
  }) => {
    const attemptStartedAt = Date.now()
    const attempt: GenerationAttemptTrace = {
      mode: params.mode,
      startedAt: attemptStartedAt,
      success: false,
      requestPayload: {
        model: request.input.modelId,
        outputCount: params.numberOfImages,
        resolution: request.input.resolutionPreset,
        aspectRatio: request.input.aspectRatio,
        hasNegativePrompt: Boolean(params.negativePrompt),
        references: params.references?.length ?? 0,
      },
    }

    try {
      const result = await generateImage({
        adapter,
        prompt: params.promptText,
        numberOfImages: params.numberOfImages,
        size: `${request.resolution.width}x${request.resolution.height}`,
        modelOptions: {
          ...(params.negativePrompt ? { negativePrompt: params.negativePrompt } : {}),
          ...(params.references?.length
            ? { referenceDataUrls: params.references }
            : {}),
        },
      })

      attempt.success = true
      attempt.finishedAt = Date.now()
      attempt.responsePayload = {
        resultId: result.id,
        model: result.model,
        images: result.images.length,
      }
      attempts.push(attempt)

      const outputs = await toOutputs(result.images, request)
      const uniqueOutputs = await dedupeOutputsByContent(outputs)
      return { result, outputs: uniqueOutputs, attempt }
    } catch (reason) {
      attempt.success = false
      attempt.finishedAt = Date.now()
      attempt.error = reason instanceof Error ? reason.message : 'Generation failed'
      attempts.push(attempt)
      throw reason
    }
  }

  let result:
    | {
        id: string
        model: string
      }
    | undefined
  let outputs: GenerationResult['outputs'] = []
  let fallbackUsed = false

  try {
    const standard = await runAttempt({
      mode: 'standard',
      promptText: prompt,
      numberOfImages: request.input.outputCount,
      negativePrompt: request.input.negativePrompt,
      references: referenceDataUrls,
    })

    result = standard.result
    outputs = standard.outputs
  } catch (reason) {
    if (!isStackOverflowError(reason)) {
      throw normalizeGenerationError(reason)
    }

    try {
      const compatibility = await runAttempt({
        mode: 'compatibility',
        promptText: request.input.prompt,
        numberOfImages: 1,
      })

      fallbackUsed = true
      result = compatibility.result
      outputs = compatibility.outputs
    } catch (fallbackReason) {
      throw normalizeGenerationError(fallbackReason)
    }
  }

  const finishedAt = Date.now()

  return {
    outputs,
    trace: {
      requestAt: startedAt,
      finishedAt,
      fallbackUsed,
      ...(request.includeTrace
        ? {
            attempts,
            requestPayload: {
              model: request.input.modelId,
              outputCount: fallbackUsed ? 1 : request.input.outputCount,
              aspectRatio: request.input.aspectRatio,
              resolution: request.input.resolutionPreset,
              hasNegativePrompt: fallbackUsed ? false : Boolean(request.input.negativePrompt),
              references: fallbackUsed ? 0 : request.input.referenceAssetIds.length,
            },
            responsePayload: {
              resultId: result.id,
              model: result.model,
              images: outputs.length,
            },
          }
        : undefined),
    },
  }
}

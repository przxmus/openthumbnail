import { OpenRouter } from '@openrouter/sdk'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import type { ImageGenerationOptions, ImageGenerationResult } from '@tanstack/ai'

export interface OpenThumbnailImageProviderOptions {
  negativePrompt?: string
  referenceDataUrls?: Array<string>
}

const SIZE_TO_ASPECT_RATIO: Record<string, string> = {
  '1024x1024': '1:1',
  '832x1248': '2:3',
  '1248x832': '3:2',
  '864x1184': '3:4',
  '1184x864': '4:3',
  '896x1152': '4:5',
  '1152x896': '5:4',
  '768x1344': '9:16',
  '1344x768': '16:9',
  '1536x672': '21:9',
}

function extractAspectRatio(size?: string) {
  if (!size) {
    return undefined
  }

  const direct = SIZE_TO_ASPECT_RATIO[size]
  if (direct) {
    return direct
  }

  const [widthText, heightText] = size.split('x')
  const width = Number(widthText)
  const height = Number(heightText)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined
  }

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const divisor = gcd(width, height)

  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`
}

function normalizeReferenceImages(referenceDataUrls: Array<string> | undefined) {
  if (!referenceDataUrls?.length) {
    return []
  }

  return referenceDataUrls.map((url) => ({
    type: 'image_url' as const,
    imageUrl: {
      url,
    },
  }))
}

function asImageRecord(value: unknown): { imageUrl?: { url?: string } } | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  return value as { imageUrl?: { url?: string } }
}

function toImagePayload(url: string) {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:image\/[^;]+;base64,(.+)$/)
    if (match) {
      return { b64Json: match[1], url }
    }
  }

  return { url }
}

export class OpenThumbnailOpenRouterImageAdapter extends BaseImageAdapter<
  string,
  OpenThumbnailImageProviderOptions,
  Record<string, OpenThumbnailImageProviderOptions>,
  Record<string, string>
> {
  readonly kind = 'image' as const
  readonly name = 'openrouter-openthumbnail' as const

  private client: OpenRouter

  constructor(apiKey: string, model: string) {
    super({}, model)
    this.client = new OpenRouter({ apiKey })
  }

  async generateImages(
    options: ImageGenerationOptions<OpenThumbnailImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const aspectRatio = extractAspectRatio(options.size)
    const references = normalizeReferenceImages(options.modelOptions?.referenceDataUrls)

    const response = await this.client.chat.send({
      chatGenerationParams: {
        model: options.model,
        modalities: ['image'],
        stream: false,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: options.prompt,
              },
              ...references,
            ],
          },
        ],
        imageConfig: {
          ...(options.numberOfImages ? { n: options.numberOfImages } : {}),
          ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
          ...(options.modelOptions?.negativePrompt
            ? {
                negative_prompt: options.modelOptions.negativePrompt,
              }
            : {}),
        },
      },
    })

    const images: Array<{ url?: string; b64Json?: string }> = []
    const seen = new Set<string>()

    const pushUnique = (url: string | undefined) => {
      if (!url) {
        return
      }

      const key = url.startsWith('data:') ? `data:${url.slice(0, 128)}` : `url:${url}`
      if (seen.has(key)) {
        return
      }

      seen.add(key)
      images.push(toImagePayload(url))
    }

    for (const choice of response.choices) {
      const choiceImages = choice.message.images ?? []

      for (const image of choiceImages) {
        pushUnique(image.imageUrl.url)
      }

      const content = choice.message.content
      if (Array.isArray(content)) {
        for (const part of content) {
          const record = asImageRecord(part)
          pushUnique(record?.imageUrl?.url)
        }
      }
    }

    return {
      id: response.id,
      model: response.model,
      images,
    }
  }
}

export function openThumbnailOpenRouterImage(apiKey: string, model: string) {
  return new OpenThumbnailOpenRouterImageAdapter(apiKey, model)
}

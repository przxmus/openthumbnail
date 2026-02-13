import type { EditOperations } from '@/types/workshop'

interface CanvasExportOptions {
  type: string
  quality?: number
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, options: CanvasExportOptions) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Unable to create image blob'))
          return
        }

        resolve(blob)
      },
      options.type,
      options.quality,
    )
  })
}

export function blobToObjectUrl(blob: Blob) {
  return URL.createObjectURL(blob)
}

export function revokeObjectUrl(url: string) {
  URL.revokeObjectURL(url)
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Failed to convert blob to data URL'))
    }

    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl)
  return response.blob()
}

export async function readImageDimensions(blob: Blob) {
  const image = await loadImageFromBlob(blob)
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
  }
}

export function loadImageFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load image blob'))
    }

    image.src = url
  })
}

export async function convertBlobToJpg(blob: Blob, quality = 0.92) {
  const source = await loadImageFromBlob(blob)
  const canvas = createCanvas(source.naturalWidth, source.naturalHeight)
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas context unavailable')
  }

  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return toBlob(canvas, { type: 'image/jpeg', quality })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function applySharpen(source: ImageData, strength: number) {
  if (strength <= 0) {
    return source
  }

  const width = source.width
  const height = source.height
  const src = source.data
  const out = new Uint8ClampedArray(src.length)

  const amount = Math.min(2, strength / 100)
  const kernel = [0, -amount, 0, -amount, 1 + amount * 4, -amount, 0, -amount, 0]

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const base = (y * width + x) * 4

      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0
        let kernelIndex = 0

        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const pixelIndex = ((y + ky) * width + (x + kx)) * 4 + channel
            value += src[pixelIndex] * kernel[kernelIndex]
            kernelIndex += 1
          }
        }

        out[base + channel] = Math.max(0, Math.min(255, value))
      }

      out[base + 3] = src[base + 3]
    }
  }

  return new ImageData(out, width, height)
}

export async function applyImageEdits(inputBlob: Blob, operations: EditOperations) {
  const image = await loadImageFromBlob(inputBlob)

  const cropX = Math.max(0, Math.min(99, operations.cropX))
  const cropY = Math.max(0, Math.min(99, operations.cropY))
  const cropWidth = Math.max(1, Math.min(100, operations.cropWidth))
  const cropHeight = Math.max(1, Math.min(100, operations.cropHeight))

  const sx = Math.round((cropX / 100) * image.naturalWidth)
  const sy = Math.round((cropY / 100) * image.naturalHeight)
  const sw = Math.max(1, Math.round((cropWidth / 100) * image.naturalWidth))
  const sh = Math.max(1, Math.round((cropHeight / 100) * image.naturalHeight))

  const cropCanvas = createCanvas(sw, sh)
  const cropCtx = cropCanvas.getContext('2d')

  if (!cropCtx) {
    throw new Error('Canvas context unavailable')
  }

  cropCtx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh)

  const rotationRadians = (operations.rotate * Math.PI) / 180
  const sin = Math.abs(Math.sin(rotationRadians))
  const cos = Math.abs(Math.cos(rotationRadians))
  const outW = Math.max(1, Math.round(sw * cos + sh * sin))
  const outH = Math.max(1, Math.round(sw * sin + sh * cos))

  const rotatedCanvas = createCanvas(outW, outH)
  const rotatedCtx = rotatedCanvas.getContext('2d')

  if (!rotatedCtx) {
    throw new Error('Canvas context unavailable')
  }

  rotatedCtx.translate(outW / 2, outH / 2)
  rotatedCtx.rotate(rotationRadians)
  rotatedCtx.filter = `brightness(${operations.brightness}%) contrast(${operations.contrast}%) saturate(${operations.saturation}%) blur(${operations.blur}px)`
  rotatedCtx.drawImage(cropCanvas, -sw / 2, -sh / 2)
  rotatedCtx.filter = 'none'

  if (operations.sharpen > 0) {
    const imageData = rotatedCtx.getImageData(0, 0, outW, outH)
    const sharpened = applySharpen(imageData, operations.sharpen)
    rotatedCtx.putImageData(sharpened, 0, 0)
  }

  const outputBlob = await toBlob(rotatedCanvas, { type: inputBlob.type || 'image/png' })
  return {
    blob: outputBlob,
    width: outW,
    height: outH,
  }
}

export async function resolveGeneratedImageBlob(image: {
  url?: string
  b64Json?: string
}) {
  if (image.b64Json) {
    const response = await fetch(`data:image/png;base64,${image.b64Json}`)
    return response.blob()
  }

  if (image.url) {
    const response = await fetch(image.url)
    if (!response.ok) {
      throw new Error(`Unable to download generated image (${response.status})`)
    }

    return response.blob()
  }

  throw new Error('Generated image payload is empty')
}

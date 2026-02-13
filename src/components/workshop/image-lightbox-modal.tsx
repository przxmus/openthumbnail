import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { OutputAsset } from '@/types/workshop'
import { m } from '@/paraglide/messages.js'
import { useObjectUrl } from '@/lib/hooks/use-object-url'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface LightboxGalleryItem {
  asset: OutputAsset
  label: string
}

interface ImageLightboxModalProps {
  open: boolean
  title: string
  items: Array<LightboxGalleryItem>
  initialAssetId?: string
  onClose: () => void
}

interface Size {
  width: number
  height: number
}

const MIN_ZOOM = 1
const MAX_ZOOM = 6
const ZOOM_STEP = 0.2

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeZoom(value: number) {
  return Math.round(value * 100) / 100
}

function fitWithinContainer(container: Size, image: Size): Size {
  if (container.width <= 0 || container.height <= 0 || image.width <= 0 || image.height <= 0) {
    return { width: 0, height: 0 }
  }

  const scale = Math.min(container.width / image.width, container.height / image.height)
  return {
    width: image.width * scale,
    height: image.height * scale,
  }
}

function clampPanOffset(offset: { x: number; y: number }, zoom: number, viewport: Size, baseImage: Size) {
  const scaledWidth = baseImage.width * zoom
  const scaledHeight = baseImage.height * zoom

  const maxX = Math.max(0, (scaledWidth - viewport.width) / 2)
  const maxY = Math.max(0, (scaledHeight - viewport.height) / 2)

  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  }
}

export function ImageLightboxModal({
  open,
  title,
  items,
  initialAssetId,
  onClose,
}: ImageLightboxModalProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 })

  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    initialX: number
    initialY: number
  } | null>(null)
  const pinchDistanceRef = useRef<number | null>(null)
  const pinchZoomRef = useRef(1)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  const current = items.at(activeIndex) ?? null
  const currentImageUrl = useObjectUrl(current ? current.asset.blob : null)

  const baseImageSize = useMemo(
    () =>
      fitWithinContainer(viewportSize, {
        width: current?.asset.width ?? 0,
        height: current?.asset.height ?? 0,
      }),
    [current?.asset.height, current?.asset.width, viewportSize],
  )

  const clampOffsetForCurrent = useCallback(
    (nextOffset: { x: number; y: number }, nextZoom: number) =>
      clampPanOffset(nextOffset, nextZoom, viewportSize, baseImageSize),
    [baseImageSize, viewportSize],
  )

  const applyZoomAtPoint = useCallback(
    (getNextZoom: (currentZoom: number) => number, point: { x: number; y: number }) => {
      setZoom((currentZoom) => {
        const nextZoom = normalizeZoom(clamp(getNextZoom(currentZoom), MIN_ZOOM, MAX_ZOOM))
        if (nextZoom === currentZoom) {
          return currentZoom
        }

        setOffset((currentOffset) => {
          const centerX = viewportSize.width / 2
          const centerY = viewportSize.height / 2
          const worldX = (point.x - centerX - currentOffset.x) / currentZoom
          const worldY = (point.y - centerY - currentOffset.y) / currentZoom
          const rawOffset = {
            x: point.x - centerX - worldX * nextZoom,
            y: point.y - centerY - worldY * nextZoom,
          }

          return clampOffsetForCurrent(rawOffset, nextZoom)
        })

        return nextZoom
      })
    },
    [clampOffsetForCurrent, viewportSize.height, viewportSize.width],
  )

  const getViewportCenter = () => {
    return {
      x: viewportSize.width / 2,
      y: viewportSize.height / 2,
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }

    if (!items.length) {
      setActiveIndex(0)
      return
    }

    if (initialAssetId) {
      const index = items.findIndex((item) => item.asset.id === initialAssetId)
      if (index >= 0) {
        setActiveIndex(index)
        return
      }
    }

    setActiveIndex(0)
  }, [initialAssetId, items, open])

  useEffect(() => {
    if (!open) {
      return
    }

    const node = viewportRef.current
    if (!node) {
      return
    }

    const applySize = () => {
      setViewportSize({
        width: node.clientWidth,
        height: node.clientHeight,
      })
    }

    applySize()

    const observer = new ResizeObserver(() => {
      applySize()
    })

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [open])

  const hasPrev = activeIndex > 0
  const hasNext = activeIndex < items.length - 1

  const goPrev = useCallback(() => {
    setActiveIndex((index) => Math.max(0, index - 1))
  }, [])

  const goNext = useCallback(() => {
    setActiveIndex((index) => Math.min(items.length - 1, index + 1))
  }, [items.length])

  const resetTransform = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    pinchDistanceRef.current = null
    pinchZoomRef.current = 1
  }

  useEffect(() => {
    resetTransform()
  }, [activeIndex])

  useEffect(() => {
    if (!open) {
      return
    }

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [goNext, goPrev, onClose, open])

  useEffect(() => {
    if (!open) {
      return
    }

    if (zoom <= 1) {
      setOffset({ x: 0, y: 0 })
    }
  }, [open, zoom])

  useEffect(() => {
    setOffset((currentOffset) => clampOffsetForCurrent(currentOffset, zoom))
  }, [clampOffsetForCurrent, zoom])

  const transformStyle = useMemo(
    () => ({
      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
    }),
    [offset.x, offset.y, zoom],
  )

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex h-screen w-screen flex-col bg-black/90 text-white">
      <button
        type="button"
        aria-label={m.common_close()}
        className="absolute inset-0"
        onClick={onClose}
      />

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-white/70 text-xs">{title}</p>
          <p className="truncate text-sm font-medium">
            {(current ? current.label : m.common_unknown())} · {items.length ? activeIndex + 1 : 0}/{items.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
            onClick={() => {
              applyZoomAtPoint((currentZoom) => currentZoom - ZOOM_STEP, getViewportCenter())
            }}
          >
            {m.lightbox_zoom_out()}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
            onClick={() => {
              applyZoomAtPoint((currentZoom) => currentZoom + ZOOM_STEP, getViewportCenter())
            }}
          >
            {m.lightbox_zoom_in()}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
            onClick={resetTransform}
          >
            {m.lightbox_zoom_reset()}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
            onClick={onClose}
          >
            {m.common_close()}
          </Button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-6">
        {items.length > 1 ? (
          <button
            type="button"
            className={cn(
              'absolute left-4 z-20 rounded-full border border-white/20 bg-black/40 px-3 py-2 text-sm',
              !hasPrev && 'pointer-events-none opacity-30',
            )}
            onClick={goPrev}
          >
            {m.lightbox_prev()}
          </button>
        ) : null}

        <div
          ref={viewportRef}
          className="relative h-full w-full max-w-[92vw] overflow-hidden rounded-2xl border border-white/10 bg-black/30"
          onClick={(event) => event.stopPropagation()}
          onWheel={(event) => {
            event.preventDefault()
            const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
            const rect = event.currentTarget.getBoundingClientRect()
            const point = {
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            }
            applyZoomAtPoint((currentZoom) => currentZoom + delta, point)
          }}
          onPointerDown={(event) => {
            if (zoom <= 1) {
              return
            }

            dragStateRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              initialX: offset.x,
              initialY: offset.y,
            }
            setIsDragging(true)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const dragState = dragStateRef.current
            if (!dragState || dragState.pointerId !== event.pointerId || zoom <= 1) {
              return
            }

            const dx = event.clientX - dragState.startX
            const dy = event.clientY - dragState.startY
            const rawOffset = {
              x: dragState.initialX + dx,
              y: dragState.initialY + dy,
            }
            setOffset(clampOffsetForCurrent(rawOffset, zoom))
          }}
          onPointerUp={(event) => {
            const dragState = dragStateRef.current
            if (dragState && dragState.pointerId === event.pointerId) {
              dragStateRef.current = null
            }

            setIsDragging(false)
          }}
          onPointerCancel={() => {
            dragStateRef.current = null
            setIsDragging(false)
          }}
          onTouchStart={(event) => {
            if (event.touches.length < 2) {
              pinchDistanceRef.current = null
              return
            }

            const first = event.touches[0]
            const second = event.touches[1]
            const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
            pinchDistanceRef.current = distance
            pinchZoomRef.current = zoom
          }}
          onTouchMove={(event) => {
            if (event.touches.length < 2 || pinchDistanceRef.current === null) {
              return
            }

            event.preventDefault()
            const first = event.touches[0]
            const second = event.touches[1]
            const nextDistance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
            const ratio = nextDistance / pinchDistanceRef.current
            const nextZoom = pinchZoomRef.current * ratio
            const rect = event.currentTarget.getBoundingClientRect()
            const midpoint = {
              x: (first.clientX + second.clientX) / 2 - rect.left,
              y: (first.clientY + second.clientY) / 2 - rect.top,
            }
            applyZoomAtPoint(() => nextZoom, midpoint)
          }}
          onTouchEnd={() => {
            pinchDistanceRef.current = null
          }}
          onTouchCancel={() => {
            pinchDistanceRef.current = null
          }}
        >
          {currentImageUrl ? (
            <div
              className={cn(
                'absolute left-1/2 top-1/2',
                isDragging ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : 'cursor-zoom-in',
              )}
              style={{
                ...transformStyle,
                width: `${baseImageSize.width}px`,
                height: `${baseImageSize.height}px`,
              }}
            >
              <img
                src={currentImageUrl}
                alt={current ? current.label : m.common_unknown()}
                className="h-full w-full object-fill"
                draggable={false}
              />
            </div>
          ) : (
            <div className="text-white/70 grid h-full place-items-center text-sm">
              {m.asset_preview_unavailable()}
            </div>
          )}
        </div>

        {items.length > 1 ? (
          <button
            type="button"
            className={cn(
              'absolute right-4 z-20 rounded-full border border-white/20 bg-black/40 px-3 py-2 text-sm',
              !hasNext && 'pointer-events-none opacity-30',
            )}
            onClick={goNext}
          >
            {m.lightbox_next()}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

import { useEffect, useMemo, useState } from 'react'

import type { EditOperations, OutputAsset } from '@/types/workshop'
import { m } from '@/paraglide/messages.js'
import { applyImageEdits } from '@/lib/services/image-utils'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

interface ImageEditorModalProps {
  open: boolean
  sourceAsset: OutputAsset | null
  initialOperations: EditOperations
  busy?: boolean
  onCancel: () => void
  onApply: (operations: EditOperations) => Promise<void> | void
}

interface SliderConfig {
  key: keyof EditOperations
  min: number
  max: number
  step?: number
  label: (value: number) => string
  defaultValue: number
  group: 'crop' | 'transform' | 'color' | 'effects'
}

function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }

    const next = URL.createObjectURL(blob)
    setUrl(next)

    return () => {
      URL.revokeObjectURL(next)
    }
  }, [blob])

  return url
}

const SLIDER_GROUP_LABELS: Record<string, string> = {
  crop: 'Crop',
  transform: 'Transform',
  color: 'Color',
  effects: 'Effects',
}

export function ImageEditorModal({
  open,
  sourceAsset,
  initialOperations,
  busy = false,
  onCancel,
  onApply,
}: ImageEditorModalProps) {
  const [operations, setOperations] =
    useState<EditOperations>(initialOperations)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (!open || !sourceAsset) {
      return
    }

    setOperations(initialOperations)
    setPreviewBlob(sourceAsset.blob)
  }, [initialOperations, open, sourceAsset])

  useEffect(() => {
    if (!open || !sourceAsset) {
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true)

      try {
        const edited = await applyImageEdits(sourceAsset.blob, operations)
        if (!cancelled) {
          setPreviewBlob(edited.blob)
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false)
        }
      }
    }, 90)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, operations, sourceAsset])

  const sourceUrl = useObjectUrl(sourceAsset?.blob ?? null)
  const previewUrl = useObjectUrl(previewBlob)

  const sliders = useMemo<Array<SliderConfig>>(
    () => [
      {
        key: 'cropX',
        min: 0,
        max: 99,
        defaultValue: 0,
        group: 'crop',
        label: (value) => m.editor_crop_x({ value: String(value) }),
      },
      {
        key: 'cropY',
        min: 0,
        max: 99,
        defaultValue: 0,
        group: 'crop',
        label: (value) => m.editor_crop_y({ value: String(value) }),
      },
      {
        key: 'cropWidth',
        min: 1,
        max: 100,
        defaultValue: 100,
        group: 'crop',
        label: (value) => m.editor_crop_width({ value: String(value) }),
      },
      {
        key: 'cropHeight',
        min: 1,
        max: 100,
        defaultValue: 100,
        group: 'crop',
        label: (value) => m.editor_crop_height({ value: String(value) }),
      },
      {
        key: 'rotate',
        min: -180,
        max: 180,
        defaultValue: 0,
        group: 'transform',
        label: (value) => m.editor_rotate({ value: String(value) }),
      },
      {
        key: 'brightness',
        min: 0,
        max: 200,
        defaultValue: 100,
        group: 'color',
        label: (value) => m.editor_brightness({ value: String(value) }),
      },
      {
        key: 'contrast',
        min: 0,
        max: 200,
        defaultValue: 100,
        group: 'color',
        label: (value) => m.editor_contrast({ value: String(value) }),
      },
      {
        key: 'saturation',
        min: 0,
        max: 300,
        defaultValue: 100,
        group: 'color',
        label: (value) => m.editor_saturation({ value: String(value) }),
      },
      {
        key: 'blur',
        min: 0,
        max: 12,
        step: 1,
        defaultValue: 0,
        group: 'effects',
        label: (value) => m.editor_blur({ value: String(value) }),
      },
      {
        key: 'sharpen',
        min: 0,
        max: 100,
        defaultValue: 0,
        group: 'effects',
        label: (value) => m.editor_sharpen({ value: String(value) }),
      },
    ],
    [],
  )

  const groups = useMemo(() => {
    const result: Record<string, Array<SliderConfig>> = {}
    for (const slider of sliders) {
      const group = result[slider.group] ?? []
      group.push(slider)
      result[slider.group] = group
    }
    return result
  }, [sliders])

  const isModified = useMemo(() => {
    return sliders.some((s) => operations[s.key] !== s.defaultValue)
  }, [sliders, operations])

  const handleReset = () => {
    const reset: Partial<EditOperations> = {}
    for (const s of sliders) {
      reset[s.key] = s.defaultValue
    }
    setOperations((current) => ({ ...current, ...reset }))
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={m.editor_modal_title()}
      description={m.editor_modal_description()}
      closeLabel={m.common_close()}
      size="xl"
      footer={
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!isModified}
            className="text-muted-foreground"
          >
            Reset all
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              {m.editor_cancel()}
            </Button>
            <Button
              disabled={!sourceAsset || busy}
              onClick={async () => {
                await onApply(operations)
              }}
            >
              {m.editor_apply()}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        {/* Preview panel */}
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{m.timeline_output()}</p>
            {previewLoading ? (
              <span className="bg-primary/10 text-primary animate-pulse rounded-full px-2 py-0.5 text-xs font-medium">
                Processing...
              </span>
            ) : null}
          </div>
          <div className="bg-muted/30 ring-border/50 relative aspect-video overflow-hidden rounded-xl ring-1">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={m.timeline_output()}
                className="h-full w-full object-contain transition-opacity"
                style={{ opacity: previewLoading ? 0.6 : 1 }}
              />
            ) : (
              <div className="text-muted-foreground grid h-full place-items-center text-sm">
                No preview
              </div>
            )}
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {sourceAsset?.width ?? 0} &times; {sourceAsset?.height ?? 0}
          </p>
        </div>

        {/* Sliders panel */}
        <div className="grid gap-3">
          <div className="pretty-scroll bg-muted/20 ring-border/30 grid max-h-[68vh] gap-4 overflow-auto rounded-xl p-4 ring-1">
            {Object.entries(groups).map(([groupKey, groupSliders]) => (
              <div key={groupKey} className="grid gap-3">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                  {SLIDER_GROUP_LABELS[groupKey] ?? groupKey}
                </p>
                {groupSliders.map((slider) => {
                  const value = operations[slider.key]
                  const isDefault = value === slider.defaultValue

                  return (
                    <label key={slider.key} className="group grid gap-1.5">
                      <span className="flex items-center justify-between text-xs">
                        <span className="text-foreground/80 font-medium">
                          {slider.label(value)}
                        </span>
                        {!isDefault ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              setOperations((current) => ({
                                ...current,
                                [slider.key]: slider.defaultValue,
                              }))
                            }}
                            className="text-muted-foreground hover:text-foreground cursor-pointer text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            Reset
                          </button>
                        ) : null}
                      </span>
                      <input
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        step={slider.step ?? 1}
                        value={value}
                        className="range-input h-2 w-full"
                        onChange={(event) => {
                          const nextValue = Number(event.target.value)
                          setOperations((current) => ({
                            ...current,
                            [slider.key]: nextValue,
                          }))
                        }}
                      />
                    </label>
                  )
                })}
                <div className="bg-border/40 h-px last:hidden" />
              </div>
            ))}
          </div>

          {sourceUrl ? (
            <details className="bg-muted/20 ring-border/30 rounded-xl p-3 ring-1">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium transition-colors">
                {m.timeline_source()}
              </summary>
              <div className="mt-3 aspect-video overflow-hidden rounded-lg">
                <img
                  src={sourceUrl}
                  alt={m.timeline_source()}
                  className="h-full w-full object-contain"
                />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

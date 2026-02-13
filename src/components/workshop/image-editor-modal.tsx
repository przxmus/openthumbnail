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
}

const sliderClassName =
  'range-input h-2.5 w-full'

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

export function ImageEditorModal({
  open,
  sourceAsset,
  initialOperations,
  busy = false,
  onCancel,
  onApply,
}: ImageEditorModalProps) {
  const [operations, setOperations] = useState<EditOperations>(initialOperations)
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
        label: (value) => m.editor_crop_x({ value: String(value) }),
      },
      {
        key: 'cropY',
        min: 0,
        max: 99,
        label: (value) => m.editor_crop_y({ value: String(value) }),
      },
      {
        key: 'cropWidth',
        min: 1,
        max: 100,
        label: (value) => m.editor_crop_width({ value: String(value) }),
      },
      {
        key: 'cropHeight',
        min: 1,
        max: 100,
        label: (value) => m.editor_crop_height({ value: String(value) }),
      },
      {
        key: 'rotate',
        min: -180,
        max: 180,
        label: (value) => m.editor_rotate({ value: String(value) }),
      },
      {
        key: 'brightness',
        min: 0,
        max: 200,
        label: (value) => m.editor_brightness({ value: String(value) }),
      },
      {
        key: 'contrast',
        min: 0,
        max: 200,
        label: (value) => m.editor_contrast({ value: String(value) }),
      },
      {
        key: 'saturation',
        min: 0,
        max: 300,
        label: (value) => m.editor_saturation({ value: String(value) }),
      },
      {
        key: 'blur',
        min: 0,
        max: 12,
        step: 1,
        label: (value) => m.editor_blur({ value: String(value) }),
      },
      {
        key: 'sharpen',
        min: 0,
        max: 100,
        label: (value) => m.editor_sharpen({ value: String(value) }),
      },
    ],
    [],
  )

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={m.editor_modal_title()}
      description={m.editor_modal_description()}
      closeLabel={m.common_close()}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
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
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <div className="grid gap-3">
          <p className="text-sm font-medium">{m.timeline_output()}</p>
          <div className="bg-muted/30 relative aspect-video overflow-hidden rounded-2xl">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={m.timeline_output()}
                className="h-full w-full object-contain"
              />
            ) : null}
            {previewLoading ? (
              <div className="bg-background/70 text-muted-foreground absolute inset-0 grid place-items-center text-sm">
                {m.generation_button_busy()}
              </div>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            {sourceAsset?.width ?? 0} x {sourceAsset?.height ?? 0}
          </p>
        </div>

        <div className="grid gap-4">
          <div className="bg-muted/20 grid max-h-[68vh] gap-3 overflow-auto rounded-2xl p-4">
            {sliders.map((slider) => {
              const value = operations[slider.key]

              return (
                <label key={slider.key} className="grid gap-2 text-sm">
                  <span>{slider.label(value)}</span>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step ?? 1}
                    value={value}
                    className={sliderClassName}
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
          </div>

          {sourceUrl ? (
            <details className="bg-muted/20 rounded-2xl p-3">
              <summary className="cursor-pointer text-sm font-medium">{m.timeline_source()}</summary>
              <div className="mt-3 aspect-video overflow-hidden rounded-xl">
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

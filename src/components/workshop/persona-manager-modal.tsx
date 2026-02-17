import { useEffect, useMemo, useRef, useState } from 'react'

import type { LightboxContext, OutputAsset, Persona } from '@/types/workshop'
import { m } from '@/paraglide/messages.js'
import { AssetThumb } from '@/components/workshop/asset-thumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckmarkCircle02Icon,
  Delete02Icon,
  ImageAdd02Icon,
  PlusSignIcon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons'

interface PersonaManagerModalProps {
  open: boolean
  personas: Array<Persona>
  assetsMap: Map<string, OutputAsset>
  selectedPersonaIds: Array<string>
  onClose: () => void
  onCreatePersona: (name: string) => Promise<void>
  onRenamePersona: (personaId: string, name: string) => Promise<void>
  onDeletePersona: (personaId: string) => Promise<void>
  onAddPersonaImages: (personaId: string, files: Array<File>) => Promise<void>
  onRemovePersonaImage: (assetId: string) => Promise<void>
  onToggleSelectedPersona: (personaId: string) => void
  onOpenLightbox: (context: LightboxContext) => void
}

export function PersonaManagerModal({
  open,
  personas,
  assetsMap,
  selectedPersonaIds,
  onClose,
  onCreatePersona,
  onRenamePersona,
  onDeletePersona,
  onAddPersonaImages,
  onRemovePersonaImage,
  onToggleSelectedPersona,
  onOpenLightbox,
}: PersonaManagerModalProps) {
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null)
  const [newPersonaName, setNewPersonaName] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    if (!personas.length) {
      setActivePersonaId(null)
      setRenameValue('')
      return
    }

    const nextId =
      activePersonaId &&
      personas.some((persona) => persona.id === activePersonaId)
        ? activePersonaId
        : personas[0].id

    setActivePersonaId(nextId)
    const active = personas.find((persona) => persona.id === nextId)
    setRenameValue(active?.name ?? '')
  }, [activePersonaId, open, personas])

  const activePersona = useMemo(
    () => personas.find((persona) => persona.id === activePersonaId) ?? null,
    [activePersonaId, personas],
  )

  const activeAssets = useMemo(() => {
    if (!activePersona) {
      return []
    }

    return activePersona.referenceAssetIds
      .map((assetId) => assetsMap.get(assetId))
      .filter((asset): asset is OutputAsset => Boolean(asset))
  }, [activePersona, assetsMap])

  const handleCreate = async () => {
    if (busy || !newPersonaName.trim()) return
    setBusy(true)
    try {
      await onCreatePersona(newPersonaName)
      setNewPersonaName('')
    } finally {
      setBusy(false)
    }
  }

  const handleRename = async () => {
    if (busy || !renameValue.trim() || !activePersona) return
    setBusy(true)
    try {
      await onRenamePersona(activePersona.id, renameValue)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={m.persona_modal_title()}
      description={m.persona_modal_description()}
      closeLabel={m.common_close()}
      size="xl"
    >
      <div className="grid min-h-[70vh] gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── Left: persona list ── */}
        <section className="border-border/50 bg-muted/30 flex min-h-0 flex-col gap-3 rounded-2xl border p-4">
          <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-widest uppercase">
            <HugeiconsIcon icon={UserMultiple02Icon} size={14} />
            {m.personas_title()}
          </div>

          {/* create form */}
          <div className="flex gap-2">
            <Input
              placeholder={m.persona_create_label()}
              value={newPersonaName}
              onChange={(event) => setNewPersonaName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleCreate()
                }
              }}
              className="flex-1"
            />
            <Button
              size="icon-sm"
              disabled={busy || !newPersonaName.trim()}
              onClick={() => void handleCreate()}
            >
              <HugeiconsIcon icon={PlusSignIcon} size={16} />
            </Button>
          </div>

          {/* persona list */}
          <div className="pretty-scroll min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
            {personas.length === 0 ? (
              <p className="border-border/50 text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm">
                {m.persona_no_items()}
              </p>
            ) : null}

            {personas.map((persona) => {
              const selected = selectedPersonaIds.includes(persona.id)
              const isActive = persona.id === activePersonaId

              return (
                <button
                  key={persona.id}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                    isActive
                      ? 'bg-primary/10 ring-primary/40 shadow-sm ring-1'
                      : 'hover:bg-muted/60'
                  }`}
                  onClick={() => {
                    setActivePersonaId(persona.id)
                    setRenameValue(persona.name)
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {persona.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {persona.referenceAssetIds.length} {m.persona_images()}
                    </p>
                  </div>

                  <button
                    type="button"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleSelectedPersona(persona.id)
                    }}
                  >
                    {selected && (
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} />
                    )}
                  </button>
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Right: active persona detail ── */}
        <section className="border-border/50 bg-card flex min-h-0 flex-col gap-4 rounded-2xl border p-4">
          {activePersona ? (
            <>
              {/* persona actions bar */}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleRename()
                    }
                  }}
                  className="min-w-0 flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !renameValue.trim()}
                  onClick={() => void handleRename()}
                >
                  {m.persona_save()}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await onDeletePersona(activePersona.id)
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} />
                  {m.persona_delete()}
                </Button>
              </div>

              {/* hint + add images */}
              <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>{m.persona_limit_hint()}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    void onAddPersonaImages(activePersona.id, files)
                    event.target.value = ''
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <HugeiconsIcon icon={ImageAdd02Icon} size={14} />
                  {m.persona_add_images()}
                </Button>
              </div>

              {/* image grid */}
              <div className="pretty-scroll min-h-0 flex-1 overflow-auto pr-1">
                {activeAssets.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="border-border/50 text-muted-foreground rounded-xl border border-dashed px-6 py-8 text-center text-sm">
                      {m.persona_no_items()}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {activeAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="group border-border/50 bg-muted/20 relative overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
                      >
                        <button
                          type="button"
                          className="aspect-square w-full overflow-hidden"
                          onClick={() => {
                            onOpenLightbox({
                              title: activePersona.name,
                              initialAssetId: asset.id,
                              items: activeAssets.map((entry) => ({
                                assetId: entry.id,
                                label: activePersona.name,
                              })),
                            })
                          }}
                        >
                          <AssetThumb asset={asset} alt={activePersona.name} />
                        </button>
                        <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/60 to-transparent p-2 transition-transform group-hover:translate-y-0">
                          <Button
                            size="xs"
                            variant="ghost"
                            className="w-full text-white hover:text-white"
                            onClick={() => {
                              void onRemovePersonaImage(asset.id)
                            }}
                          >
                            <HugeiconsIcon icon={Delete02Icon} size={12} />
                            {m.persona_remove_image()}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <HugeiconsIcon
                  icon={UserMultiple02Icon}
                  size={32}
                  className="text-muted-foreground/50 mx-auto mb-2"
                />
                <p className="text-muted-foreground text-sm">
                  {m.persona_no_items()}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}

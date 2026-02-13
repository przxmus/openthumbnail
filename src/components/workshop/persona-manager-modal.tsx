import { useEffect, useMemo, useState } from 'react'

import type { OutputAsset, Persona } from '@/types/workshop'
import { m } from '@/paraglide/messages.js'
import { AssetThumb } from '@/components/workshop/asset-thumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

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
}: PersonaManagerModalProps) {
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null)
  const [newPersonaName, setNewPersonaName] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [busy, setBusy] = useState(false)

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
      activePersonaId && personas.some((persona) => persona.id === activePersonaId)
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={m.persona_modal_title()}
      description={m.persona_modal_description()}
      closeLabel={m.common_close()}
      size="xl"
    >
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <section className="bg-muted/20 grid gap-3 rounded-2xl p-4">
          <div className="grid gap-2">
            <Input
              placeholder={m.persona_create_label()}
              value={newPersonaName}
              onChange={(event) => setNewPersonaName(event.target.value)}
            />
            <Button
              disabled={busy || !newPersonaName.trim()}
              onClick={async () => {
                setBusy(true)
                try {
                  await onCreatePersona(newPersonaName)
                  setNewPersonaName('')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {m.persona_create_button()}
            </Button>
          </div>

          <div className="min-h-0 max-h-[60vh] space-y-2 overflow-auto pr-1">
            {personas.length === 0 ? (
              <p className="text-muted-foreground text-sm">{m.persona_no_items()}</p>
            ) : null}

            {personas.map((persona) => {
              const selected = selectedPersonaIds.includes(persona.id)
              const isActive = persona.id === activePersonaId

              return (
                <button
                  key={persona.id}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    isActive
                      ? 'border-primary bg-primary/10'
                      : 'border-border/70 bg-card hover:border-primary/50'
                  }`}
                  onClick={() => {
                    setActivePersonaId(persona.id)
                    setRenameValue(persona.name)
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{persona.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {persona.referenceAssetIds.length} {m.persona_images()}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={selected}
                      className="accent-primary h-4 w-4"
                      onChange={() => {
                        onToggleSelectedPersona(persona.id)
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="grid min-h-0 gap-4">
          {activePersona ? (
            <>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={busy || !renameValue.trim()}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await onRenamePersona(activePersona.id, renameValue)
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  {m.persona_save()}
                </Button>
                <Button
                  variant="destructive"
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
                  {m.persona_delete()}
                </Button>
              </div>

              <div className="text-muted-foreground text-xs">{m.persona_limit_hint()}</div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div className="text-muted-foreground text-sm">{m.persona_add_images()}</div>
                <label className="inline-flex">
                  <input
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
                  <span className="bg-secondary text-secondary-foreground hover:bg-secondary/75 inline-flex h-9 items-center rounded-4xl px-3 text-sm font-medium">
                    {m.persona_add_images()}
                  </span>
                </label>
              </div>

              <div className="grid min-h-0 grid-cols-2 gap-3 overflow-auto pr-1 md:grid-cols-3">
                {activeAssets.map((asset) => (
                  <div key={asset.id} className="rounded-xl border border-border/70 p-2">
                    <div className="aspect-square overflow-hidden rounded-lg">
                      <AssetThumb asset={asset} alt={activePersona.name} />
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="mt-2 w-full"
                      onClick={() => {
                        void onRemovePersonaImage(asset.id)
                      }}
                    >
                      {m.persona_remove_image()}
                    </Button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{m.persona_no_items()}</p>
          )}
        </section>
      </div>
    </Modal>
  )
}

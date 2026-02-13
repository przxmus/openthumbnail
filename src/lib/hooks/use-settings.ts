import { useCallback, useEffect, useState } from 'react'

import type { AppSettings } from '@/types/workshop'
import { DEFAULT_SETTINGS } from '@/lib/constants/workshop'
import { loadSettings, saveSettings } from '@/lib/storage/settings'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    setSettings(loadSettings())
  }, [])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next: AppSettings = {
        ...current,
        ...patch,
        uiPreferences: {
          ...current.uiPreferences,
          ...(patch.uiPreferences ?? {}),
        },
      }

      saveSettings(next)
      return next
    })
  }, [])

  return {
    settings,
    updateSettings,
  }
}

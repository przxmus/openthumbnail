import { useCallback, useEffect, useState } from 'react'

import type { AppSettings } from '@/types/workshop'
import { DEFAULT_SETTINGS } from '@/lib/constants/workshop'
import { applyLocale, applyThemeMode } from '@/lib/i18n/runtime'
import { loadSettings, onSettingsUpdated, saveSettings } from '@/lib/storage/settings'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    const initial = loadSettings()
    setSettings(initial)
    applyThemeMode(initial.themeMode)
    applyLocale(initial.locale)

    return onSettingsUpdated((next) => {
      setSettings(next)
    })
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
      applyThemeMode(next.themeMode)
      applyLocale(next.locale)
      return next
    })
  }, [])

  return {
    settings,
    updateSettings,
  }
}

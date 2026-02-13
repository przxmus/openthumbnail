import { useEffect } from 'react'

import { applyLocale, applyThemeMode } from '@/lib/i18n/runtime'
import { loadSettings, onSettingsUpdated } from '@/lib/storage/settings'

export function SettingsSync() {
  useEffect(() => {
    const initial = loadSettings()
    applyThemeMode(initial.themeMode)
    applyLocale(initial.locale)

    const cleanup = onSettingsUpdated((settings) => {
      applyThemeMode(settings.themeMode)
      applyLocale(settings.locale)
    })

    if (typeof window !== 'undefined') {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const onChange = () => {
        const settings = loadSettings()
        if (settings.themeMode === 'system') {
          applyThemeMode('system')
        }
      }

      media.addEventListener('change', onChange)

      return () => {
        cleanup()
        media.removeEventListener('change', onChange)
      }
    }

    return cleanup
  }, [])

  return null
}

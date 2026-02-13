import { getLocale, setLocale } from '@/paraglide/runtime.js'
import type { AppLocale, ThemeMode } from '@/types/workshop'

export function resolveThemeMode(mode: ThemeMode) {
  if (typeof window === 'undefined') {
    return mode === 'dark' ? 'dark' : 'light'
  }

  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return mode
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === 'undefined') {
    return
  }

  const resolved = resolveThemeMode(mode)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export function applyLocale(locale: AppLocale) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }

  if (typeof window !== 'undefined') {
    setLocale(locale, { reload: false })
  }
}

export function getActiveLocale() {
  const locale = getLocale()
  if (locale === 'pl') {
    return 'pl' as const
  }

  return 'en' as const
}

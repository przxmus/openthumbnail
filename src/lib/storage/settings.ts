import { APP_LOCALES, DEFAULT_SETTINGS, PROMPT_DRAFT_STORAGE_KEY, SETTINGS_STORAGE_KEY } from '@/lib/constants/workshop'
import type { AppLocale, AppSettings, ThemeMode } from '@/types/workshop'

export interface PromptDraft {
  prompt: string
  negativePrompt: string
}

export const SETTINGS_UPDATED_EVENT = 'openthumbnail:settings-updated'

function safeParse<T>(value: string | null): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function detectPreferredLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS.locale
  }

  const language = window.navigator.language.toLowerCase()

  if (language.startsWith('pl')) {
    return 'pl'
  }

  return 'en'
}

function normalizeLocale(value: unknown): AppLocale {
  if (typeof value === 'string' && APP_LOCALES.includes(value as AppLocale)) {
    return value as AppLocale
  }

  return detectPreferredLocale()
}

function normalizeThemeMode(value: unknown): ThemeMode {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value
  }

  return DEFAULT_SETTINGS.themeMode
}

export function loadSettings(): AppSettings {
  const fallback: AppSettings = {
    ...DEFAULT_SETTINGS,
    locale: detectPreferredLocale(),
  }

  if (typeof window === 'undefined') {
    return fallback
  }

  const parsed = safeParse<Partial<AppSettings>>(window.localStorage.getItem(SETTINGS_STORAGE_KEY))

  if (!parsed) {
    return fallback
  }

  return {
    ...fallback,
    ...parsed,
    themeMode: normalizeThemeMode(parsed.themeMode),
    locale: normalizeLocale(parsed.locale),
    uiPreferences: {
      ...fallback.uiPreferences,
      ...(parsed.uiPreferences ?? {}),
    },
  }
}

export function saveSettings(settings: AppSettings) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))

  window.dispatchEvent(
    new CustomEvent<AppSettings>(SETTINGS_UPDATED_EVENT, {
      detail: settings,
    }),
  )
}

export function onSettingsUpdated(handler: (settings: AppSettings) => void) {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const listener = (event: Event) => {
    const custom = event as CustomEvent<AppSettings>
    handler(custom.detail)
  }

  window.addEventListener(SETTINGS_UPDATED_EVENT, listener)

  return () => {
    window.removeEventListener(SETTINGS_UPDATED_EVENT, listener)
  }
}

export function loadPromptDraft(projectId: string): PromptDraft {
  if (typeof window === 'undefined') {
    return { prompt: '', negativePrompt: '' }
  }

  const parsed = safeParse<Record<string, PromptDraft>>(
    window.localStorage.getItem(PROMPT_DRAFT_STORAGE_KEY),
  )

  return parsed?.[projectId] ?? { prompt: '', negativePrompt: '' }
}

export function savePromptDraft(projectId: string, draft: PromptDraft) {
  if (typeof window === 'undefined') {
    return
  }

  const parsed =
    safeParse<Record<string, PromptDraft>>(
      window.localStorage.getItem(PROMPT_DRAFT_STORAGE_KEY),
    ) ?? {}

  parsed[projectId] = draft
  window.localStorage.setItem(PROMPT_DRAFT_STORAGE_KEY, JSON.stringify(parsed))
}

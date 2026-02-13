import type { AppSettings } from '@/types/workshop'
import {
  DEFAULT_SETTINGS,
  PROMPT_DRAFT_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
} from '@/lib/constants/workshop'

export interface PromptDraft {
  prompt: string
  negativePrompt: string
}

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

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS
  }

  const parsed = safeParse<AppSettings>(window.localStorage.getItem(SETTINGS_STORAGE_KEY))

  if (!parsed) {
    return DEFAULT_SETTINGS
  }

  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    uiPreferences: {
      ...DEFAULT_SETTINGS.uiPreferences,
      ...parsed.uiPreferences,
    },
  }
}

export function saveSettings(settings: AppSettings) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
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

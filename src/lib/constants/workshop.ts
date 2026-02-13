import type {
  AppLocale,
  AppSettings,
  AspectRatio,
  ResolutionPreset,
  ResolutionPresetConfig,
  ThemeMode,
} from '@/types/workshop'

export const WORKSHOP_SCHEMA_VERSION = 1
export const DATABASE_NAME = 'openthumbnail-workshop'
export const DATABASE_VERSION = 1

export const SETTINGS_STORAGE_KEY = 'openthumbnail.settings.v1'
export const PROMPT_DRAFT_STORAGE_KEY = 'openthumbnail.prompt-drafts.v1'
export const TIMELINE_UI_STATE_STORAGE_KEY = 'openthumbnail.timeline-ui.v1'

export const DEFAULT_SETTINGS: AppSettings = {
  openRouterApiKey: '',
  nerdMode: false,
  lastUsedModel: null,
  themeMode: 'system',
  locale: 'en',
  uiPreferences: {
    showRightPanel: true,
  },
}

export const APP_LOCALES: Array<AppLocale> = ['en', 'pl']
export const THEME_MODES: Array<ThemeMode> = ['light', 'dark', 'system']

export const DEFAULT_PROJECT_NAME = 'Untitled Project'
export const DEFAULT_ASPECT_RATIO: AspectRatio = '16:9'
export const DEFAULT_RESOLUTION: ResolutionPreset = '720p'
export const DEFAULT_OUTPUT_COUNT = 1

export const MAX_OUTPUTS_UI = 4
export const MAX_PERSONA_REFERENCES = 4

export const RESOLUTION_PRESETS: Array<ResolutionPresetConfig> = [
  {
    preset: '720p',
    aspectRatio: '16:9',
    width: 1280,
    height: 720,
    label: '720p · 16:9 (1280x720)',
  },
  {
    preset: '720p',
    aspectRatio: '9:16',
    width: 720,
    height: 1280,
    label: '720p · 9:16 (720x1280)',
  },
  {
    preset: '720p',
    aspectRatio: '4:3',
    width: 960,
    height: 720,
    label: '720p · 4:3 (960x720)',
  },
  {
    preset: '720p',
    aspectRatio: '1:1',
    width: 720,
    height: 720,
    label: '720p · 1:1 (720x720)',
  },
  {
    preset: '1080p',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    label: '1080p · 16:9 (1920x1080)',
  },
  {
    preset: '1080p',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    label: '1080p · 9:16 (1080x1920)',
  },
  {
    preset: '1080p',
    aspectRatio: '4:3',
    width: 1440,
    height: 1080,
    label: '1080p · 4:3 (1440x1080)',
  },
  {
    preset: '1080p',
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    label: '1080p · 1:1 (1080x1080)',
  },
]

export const ASPECT_RATIOS: Array<AspectRatio> = ['16:9', '9:16', '4:3', '1:1']

export const YOUTUBE_THUMBNAIL_CANDIDATES = [
  'maxresdefault.jpg',
  'sddefault.jpg',
  'hqdefault.jpg',
  'mqdefault.jpg',
  'default.jpg',
]

export function getResolutionPresetConfig(
  preset: ResolutionPreset,
  aspectRatio: AspectRatio,
) {
  const value = RESOLUTION_PRESETS.find(
    (entry) => entry.preset === preset && entry.aspectRatio === aspectRatio,
  )

  if (!value) {
    throw new Error(`Unsupported preset ${preset} for ratio ${aspectRatio}`)
  }

  return value
}

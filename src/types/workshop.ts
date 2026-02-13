export type AspectRatio = '1:1' | '4:3' | '16:9' | '9:16'

export type ResolutionPreset = '720p' | '1080p'

export type ThemeMode = 'light' | 'dark' | 'system'

export type AppLocale = 'en' | 'pl'

export type TimelineStepType = 'generation' | 'edit'

export type AssetScope = 'project' | 'global'

export type AssetKind =
  | 'generated'
  | 'edited'
  | 'reference'
  | 'imported'
  | 'persona'

export interface ResolutionPresetConfig {
  preset: ResolutionPreset
  aspectRatio: AspectRatio
  width: number
  height: number
  label: string
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  defaultModel: string | null
  defaultAspectRatio: AspectRatio
  defaultResolution: ResolutionPreset
}

export interface GenerationInput {
  modelId: string
  prompt: string
  negativePrompt?: string
  referenceAssetIds: Array<string>
  personaIds: Array<string>
  aspectRatio: AspectRatio
  resolutionPreset: ResolutionPreset
  outputCount: number
}

export interface GenerationOutput {
  assetId: string
  originalMimeType: string
  width: number
  height: number
  providerUrl?: string
  revisedPrompt?: string
}

export interface GenerationTrace {
  requestAt: number
  finishedAt?: number
  requestPayload?: Record<string, unknown>
  responsePayload?: Record<string, unknown>
}

export interface GenerationStep {
  id: string
  projectId: string
  type: 'generation'
  createdAt: number
  input: GenerationInput
  outputs: Array<GenerationOutput>
  remixOfStepId?: string
  remixOfAssetId?: string
  status: 'pending' | 'completed' | 'failed'
  error?: string
  trace?: GenerationTrace
}

export interface EditOperations {
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
  rotate: number
  brightness: number
  contrast: number
  saturation: number
  blur: number
  sharpen: number
}

export interface EditStep {
  id: string
  projectId: string
  type: 'edit'
  createdAt: number
  sourceAssetId: string
  outputAssetId: string
  operations: EditOperations
}

export type TimelineStep = GenerationStep | EditStep

export interface OutputAsset {
  id: string
  scope: AssetScope
  projectId: string | null
  kind: AssetKind
  createdAt: number
  mimeType: string
  width: number
  height: number
  sourceUrl?: string
  blob: Blob
}

export interface Persona {
  id: string
  name: string
  referenceAssetIds: Array<string>
  createdAt: number
  updatedAt: number
}

export interface ModelCapability {
  id: string
  name: string
  supportsImages: boolean
  supportsReferences: boolean
  supportsNegativePrompt: boolean
  maxOutputs?: number
  availability: 'available' | 'unavailable'
  description?: string
}

export interface AppSettings {
  openRouterApiKey: string
  nerdMode: boolean
  lastUsedModel: string | null
  themeMode: ThemeMode
  locale: AppLocale
  uiPreferences: {
    showRightPanel: boolean
  }
}

export interface ProjectBackupManifest {
  schemaVersion: number
  exportedAt: number
  project: Project
  steps: Array<TimelineStep>
  assets: Array<{
    id: string
    filename: string
    mimeType: string
    width: number
    height: number
    kind: AssetKind
    createdAt: number
  }>
  personasUsed: Array<Persona>
}

export interface QuotaCleanupState {
  reason: string
  at: number
}

export interface GenerationRequest {
  apiKey: string
  input: GenerationInput
  resolution: ResolutionPresetConfig
  references: Array<OutputAsset>
  personas: Array<Persona>
  personaAssets: Array<OutputAsset>
  includeTrace: boolean
}

export interface GenerationResult {
  outputs: Array<{
    blob: Blob
    mimeType: string
    width: number
    height: number
    providerUrl?: string
    revisedPrompt?: string
  }>
  trace?: GenerationTrace
}

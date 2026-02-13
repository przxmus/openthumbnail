import JSZip from 'jszip'

import type {
  OutputAsset,
  Persona,
  Project,
  ProjectBackupManifest,
  QuotaCleanupState,
  TimelineStep,
} from '@/types/workshop'
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_PROJECT_NAME,
  DEFAULT_RESOLUTION,
} from '@/lib/constants/workshop'
import { newId } from '@/lib/services/ids'
import { getDb, isQuotaExceededError } from '@/lib/storage/db'

function sortByCreatedAt<T extends { createdAt: number }>(items: Array<T>) {
  return [...items].sort((a, b) => a.createdAt - b.createdAt)
}

function toAssetFilename(asset: OutputAsset) {
  const extension = asset.mimeType.split('/')[1] ?? 'bin'
  return `${asset.id}.${extension}`
}

export async function listProjects() {
  const db = await getDb()
  const projects = await db.getAllFromIndex('projects', 'by-lastOpenedAt')
  return [...projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}

export async function getProjectById(projectId: string) {
  const db = await getDb()
  return db.get('projects', projectId)
}

export async function createProject(name?: string) {
  const now = Date.now()
  const project: Project = {
    id: newId('project'),
    name: name?.trim() || DEFAULT_PROJECT_NAME,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    defaultModel: null,
    defaultAspectRatio: DEFAULT_ASPECT_RATIO,
    defaultResolution: DEFAULT_RESOLUTION,
  }

  const db = await getDb()
  await db.put('projects', project)

  return project
}

export async function updateProject(projectId: string, patch: Partial<Project>) {
  const db = await getDb()
  const current = await db.get('projects', projectId)

  if (!current) {
    throw new Error('Project not found')
  }

  const updated: Project = {
    ...current,
    ...patch,
    id: current.id,
    updatedAt: Date.now(),
  }

  await db.put('projects', updated)
  return updated
}

export async function touchProject(projectId: string) {
  return updateProject(projectId, { lastOpenedAt: Date.now() })
}

export async function duplicateProject(projectId: string) {
  const db = await getDb()
  const source = await db.get('projects', projectId)

  if (!source) {
    throw new Error('Project not found')
  }

  const sourceSteps = await db.getAllFromIndex('steps', 'by-projectId', projectId)
  const sourceAssets = (await db.getAllFromIndex('assets', 'by-projectId', projectId)).filter(
    (asset) => asset.scope === 'project',
  )

  const now = Date.now()
  const idMap = new Map<string, string>()

  for (const asset of sourceAssets) {
    idMap.set(asset.id, newId('asset'))
  }

  const newProject: Project = {
    ...source,
    id: newId('project'),
    name: `${source.name} Copy`,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  }

  const clonedAssets: Array<OutputAsset> = sourceAssets.map((asset) => ({
    ...asset,
    id: idMap.get(asset.id) ?? newId('asset'),
    projectId: newProject.id,
    createdAt: Date.now(),
  }))

  const clonedSteps: Array<TimelineStep> = sourceSteps.map((step) => {
    if (step.type === 'generation') {
      return {
        ...step,
        id: newId('step'),
        projectId: newProject.id,
        createdAt: Date.now(),
        input: {
          ...step.input,
          referenceAssetIds: step.input.referenceAssetIds.map(
            (assetId) => idMap.get(assetId) ?? assetId,
          ),
        },
        outputs: step.outputs.map((output) => ({
          ...output,
          assetId: idMap.get(output.assetId) ?? output.assetId,
        })),
      }
    }

    return {
      ...step,
      id: newId('step'),
      projectId: newProject.id,
      createdAt: Date.now(),
      sourceAssetId: idMap.get(step.sourceAssetId) ?? step.sourceAssetId,
      outputAssetId: idMap.get(step.outputAssetId) ?? step.outputAssetId,
    }
  })

  const tx = db.transaction(['projects', 'steps', 'assets'], 'readwrite')
  await tx.objectStore('projects').put(newProject)

  await Promise.all(clonedSteps.map((step) => tx.objectStore('steps').put(step)))
  await Promise.all(clonedAssets.map((asset) => tx.objectStore('assets').put(asset)))

  await tx.done

  return newProject
}

export async function deleteProject(projectId: string) {
  const db = await getDb()
  const tx = db.transaction(['projects', 'steps', 'assets'], 'readwrite')

  await tx.objectStore('projects').delete(projectId)

  const steps = await tx.objectStore('steps').index('by-projectId').getAll(projectId)
  for (const step of steps) {
    await tx.objectStore('steps').delete(step.id)
  }

  const assets = await tx.objectStore('assets').index('by-projectId').getAll(projectId)
  for (const asset of assets) {
    await tx.objectStore('assets').delete(asset.id)
  }

  await tx.done
}

export async function getProjectSteps(projectId: string) {
  const db = await getDb()
  const steps = await db.getAllFromIndex('steps', 'by-projectId', projectId)
  return sortByCreatedAt(steps)
}

export async function getProjectAssets(projectId: string) {
  const db = await getDb()
  return db.getAllFromIndex('assets', 'by-projectId', projectId)
}

export async function getAsset(assetId: string) {
  const db = await getDb()
  return db.get('assets', assetId)
}

export async function getAssets(assetIds: Array<string>) {
  const db = await getDb()
  const assets = await Promise.all(assetIds.map((assetId) => db.get('assets', assetId)))
  return assets.filter((asset): asset is OutputAsset => Boolean(asset))
}

export async function upsertAsset(asset: OutputAsset) {
  const db = await getDb()

  try {
    await db.put('assets', asset)
    return asset
  } catch (error) {
    if (isQuotaExceededError(error)) {
      const cleanupState: QuotaCleanupState = {
        reason: 'Local storage quota exceeded while saving image assets.',
        at: Date.now(),
      }

      throw cleanupState
    }

    throw error
  }
}

export async function appendStep(step: TimelineStep) {
  const db = await getDb()

  try {
    const tx = db.transaction(['steps', 'projects'], 'readwrite')
    await tx.objectStore('steps').put(step)

    const project = await tx.objectStore('projects').get(step.projectId)
    if (project) {
      await tx.objectStore('projects').put({
        ...project,
        updatedAt: Date.now(),
      })
    }

    await tx.done
    return step
  } catch (error) {
    if (isQuotaExceededError(error)) {
      const cleanupState: QuotaCleanupState = {
        reason: 'Local storage quota exceeded while writing timeline steps.',
        at: Date.now(),
      }

      throw cleanupState
    }

    throw error
  }
}

export async function listPersonas() {
  const db = await getDb()
  const personas = await db.getAllFromIndex('personas', 'by-updatedAt')
  return [...personas].sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function upsertPersona(persona: Persona) {
  const db = await getDb()
  await db.put('personas', persona)
  return persona
}

export async function deletePersona(personaId: string) {
  const db = await getDb()
  const persona = await db.get('personas', personaId)
  if (!persona) {
    return
  }

  const tx = db.transaction(['personas', 'assets'], 'readwrite')
  await tx.objectStore('personas').delete(personaId)

  const remainingPersonas = await tx.objectStore('personas').getAll()
  const stillUsedAssetIds = new Set(
    remainingPersonas.flatMap((entry) => entry.referenceAssetIds),
  )

  for (const assetId of persona.referenceAssetIds) {
    if (stillUsedAssetIds.has(assetId)) {
      continue
    }

    const asset = await tx.objectStore('assets').get(assetId)
    if (asset?.scope === 'global' && asset.kind === 'persona') {
      await tx.objectStore('assets').delete(assetId)
    }
  }

  await tx.done
}

export async function collectUsageForPersona(persona: Persona) {
  const db = await getDb()
  const steps = await db.getAll('steps')

  return steps.filter(
    (step) => step.type === 'generation' && step.input.personaIds.includes(persona.id),
  ).length
}

export async function collectCleanupCandidates() {
  const db = await getDb()
  const projects = await listProjects()
  const assets = await db.getAll('assets')

  const sizes = projects.map((project) => {
    const projectAssets = assets.filter((asset) => asset.projectId === project.id)
    const bytes = projectAssets.reduce((sum, asset) => sum + asset.blob.size, 0)
    return { project, bytes }
  })

  return sizes.sort((a, b) => b.bytes - a.bytes)
}

export async function exportProjectBackup(projectId: string) {
  const db = await getDb()
  const project = await db.get('projects', projectId)

  if (!project) {
    throw new Error('Project not found')
  }

  const steps = await getProjectSteps(projectId)
  const assets = (await getProjectAssets(projectId)).filter(
    (asset) => asset.scope === 'project',
  )
  const personas = await listPersonas()

  const usedPersonaIds = new Set<string>()
  for (const step of steps) {
    if (step.type === 'generation') {
      for (const personaId of step.input.personaIds) {
        usedPersonaIds.add(personaId)
      }
    }
  }

  const personasUsed = personas.filter((persona) => usedPersonaIds.has(persona.id))

  const manifest: ProjectBackupManifest = {
    schemaVersion: 1,
    exportedAt: Date.now(),
    project,
    steps,
    assets: assets.map((asset) => ({
      id: asset.id,
      filename: toAssetFilename(asset),
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      kind: asset.kind,
      createdAt: asset.createdAt,
    })),
    personasUsed,
  }

  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  for (const asset of assets) {
    zip.file(`assets/${toAssetFilename(asset)}`, asset.blob)
  }

  const blob = await zip.generateAsync({ type: 'blob' })

  return {
    filename: `${project.name.replace(/\s+/g, '-').toLowerCase()}-backup.zip`,
    blob,
  }
}

export async function importProjectBackup(file: File) {
  const zip = await JSZip.loadAsync(file)
  const manifestFile = zip.file('manifest.json')

  if (!manifestFile) {
    throw new Error('Invalid backup file: manifest missing')
  }

  const manifestJson = await manifestFile.async('string')
  const manifest = JSON.parse(manifestJson) as ProjectBackupManifest

  const db = await getDb()
  const now = Date.now()

  const sourceProject = manifest.project
  const newProjectId = newId('project')

  const project: Project = {
    ...sourceProject,
    id: newProjectId,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    name: `${sourceProject.name} Imported`,
  }

  const assetIdMap = new Map<string, string>()
  const restoredAssets: Array<OutputAsset> = []

  for (const descriptor of manifest.assets) {
    const assetFile = zip.file(`assets/${descriptor.filename}`)

    if (!assetFile) {
      continue
    }

    const blob = await assetFile.async('blob')
    const newAssetId = newId('asset')
    assetIdMap.set(descriptor.id, newAssetId)

    restoredAssets.push({
      id: newAssetId,
      scope: 'project',
      projectId: newProjectId,
      kind: descriptor.kind,
      createdAt: descriptor.createdAt,
      mimeType: descriptor.mimeType,
      width: descriptor.width,
      height: descriptor.height,
      blob,
    })
  }

  const restoredSteps: Array<TimelineStep> = manifest.steps.map((step) => {
    if (step.type === 'generation') {
      return {
        ...step,
        id: newId('step'),
        projectId: newProjectId,
        createdAt: Date.now(),
        input: {
          ...step.input,
          referenceAssetIds: step.input.referenceAssetIds.map(
            (assetId) => assetIdMap.get(assetId) ?? assetId,
          ),
        },
        outputs: step.outputs.map((output) => ({
          ...output,
          assetId: assetIdMap.get(output.assetId) ?? output.assetId,
        })),
      }
    }

    return {
      ...step,
      id: newId('step'),
      projectId: newProjectId,
      createdAt: Date.now(),
      sourceAssetId: assetIdMap.get(step.sourceAssetId) ?? step.sourceAssetId,
      outputAssetId: assetIdMap.get(step.outputAssetId) ?? step.outputAssetId,
    }
  })

  const tx = db.transaction(['projects', 'steps', 'assets'], 'readwrite')
  await tx.objectStore('projects').put(project)
  await Promise.all(restoredSteps.map((step) => tx.objectStore('steps').put(step)))
  await Promise.all(restoredAssets.map((asset) => tx.objectStore('assets').put(asset)))
  await tx.done

  for (const persona of manifest.personasUsed) {
    await db.put('personas', {
      ...persona,
      updatedAt: Date.now(),
    })
  }

  return project
}

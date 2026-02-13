import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'

import type { OutputAsset, Persona, Project, TimelineStep } from '@/types/workshop'
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  WORKSHOP_SCHEMA_VERSION,
} from '@/lib/constants/workshop'

interface DbMetaEntry {
  key: string
  value: number
}

export interface WorkshopDbSchema extends DBSchema {
  projects: {
    key: string
    value: Project
    indexes: {
      'by-updatedAt': number
      'by-lastOpenedAt': number
    }
  }
  steps: {
    key: string
    value: TimelineStep
    indexes: {
      'by-projectId': string
      'by-createdAt': number
      'by-projectId-createdAt': [string, number]
    }
  }
  assets: {
    key: string
    value: OutputAsset
    indexes: {
      'by-projectId': string
      'by-kind': string
      'by-scope-projectId': [string, string]
      'by-createdAt': number
    }
  }
  personas: {
    key: string
    value: Persona
    indexes: {
      'by-updatedAt': number
    }
  }
  meta: {
    key: string
    value: DbMetaEntry
  }
}

let dbPromise: Promise<IDBPDatabase<WorkshopDbSchema>> | null = null

export async function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<WorkshopDbSchema>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          const projects = db.createObjectStore('projects', { keyPath: 'id' })
          projects.createIndex('by-updatedAt', 'updatedAt')
          projects.createIndex('by-lastOpenedAt', 'lastOpenedAt')
        }

        if (!db.objectStoreNames.contains('steps')) {
          const steps = db.createObjectStore('steps', { keyPath: 'id' })
          steps.createIndex('by-projectId', 'projectId')
          steps.createIndex('by-createdAt', 'createdAt')
          steps.createIndex('by-projectId-createdAt', ['projectId', 'createdAt'])
        }

        if (!db.objectStoreNames.contains('assets')) {
          const assets = db.createObjectStore('assets', { keyPath: 'id' })
          assets.createIndex('by-projectId', 'projectId')
          assets.createIndex('by-kind', 'kind')
          assets.createIndex('by-scope-projectId', ['scope', 'projectId'])
          assets.createIndex('by-createdAt', 'createdAt')
        }

        if (!db.objectStoreNames.contains('personas')) {
          const personas = db.createObjectStore('personas', { keyPath: 'id' })
          personas.createIndex('by-updatedAt', 'updatedAt')
        }

        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' })
        }
      },
    })
  }

  return dbPromise
}

export async function ensureSchemaVersion() {
  const db = await getDb()
  const current = await db.get('meta', 'schemaVersion')

  if (current && current.value >= WORKSHOP_SCHEMA_VERSION) {
    return
  }

  await db.put('meta', { key: 'schemaVersion', value: WORKSHOP_SCHEMA_VERSION })
}

export function isQuotaExceededError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  return (
    error.name === 'QuotaExceededError' ||
    error.message.toLowerCase().includes('quota') ||
    error.message.toLowerCase().includes('storage')
  )
}

export async function wipeDatabase() {
  const db = await getDb()
  await Promise.all([
    db.clear('projects'),
    db.clear('steps'),
    db.clear('assets'),
    db.clear('personas'),
  ])
}

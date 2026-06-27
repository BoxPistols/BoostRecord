import type { Note, Storage } from './types'

export interface LoadResult {
  storages: Storage[]
  notes: Note[]
  error?: string
}

// The preload bridge (electron/preload.cjs). Present only when running inside
// Electron; the browser foundation falls back to the in-memory repository.
declare global {
  interface Window {
    boostnote?: {
      loadNotes(): Promise<LoadResult>
      pickStorage(): Promise<LoadResult | null>
    }
  }
}

export {}

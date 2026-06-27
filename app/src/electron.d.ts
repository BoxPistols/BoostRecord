import type { Note, Storage } from './types'

// The preload bridge (electron/preload.cjs). Present only when running inside
// Electron; the browser foundation falls back to the in-memory repository.
declare global {
  interface Window {
    boostnote?: {
      loadNotes(): Promise<{
        storages: Storage[]
        notes: Note[]
        error?: string
      }>
    }
  }
}

export {}

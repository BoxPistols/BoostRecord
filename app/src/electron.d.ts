import type { Note, Storage } from './types'

export interface LoadResult {
  storages: Storage[]
  notes: Note[]
  error?: string
}

export interface SaveResult {
  ok: boolean
  file?: string
  error?: string
}

export interface CreateResult {
  ok: boolean
  note?: Note
  error?: string
}

export interface CreateNoteOptions {
  storage?: string
  folder?: string
  content?: string
}

// The preload bridge (electron/preload.cjs). Present only when running inside
// Electron; the browser foundation falls back to the in-memory repository.
declare global {
  interface Window {
    boostnote?: {
      loadNotes(): Promise<LoadResult>
      pickStorage(): Promise<LoadResult | null>
      saveNote(note: Note): Promise<SaveResult>
      createNote(opts: CreateNoteOptions): Promise<CreateResult>
      deleteNote(key: string): Promise<SaveResult>
    }
  }
}

export {}

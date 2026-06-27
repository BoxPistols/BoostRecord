// Note model — mirrors the legacy on-disk `.cson` note shape so the same data
// loads unchanged. The Electron data layer will read real `.cson` files into
// these; the browser foundation uses sample data of the same shape.

export type NoteType = 'MARKDOWN_NOTE' | 'SNIPPET_NOTE'

export interface Note {
  key: string
  type: NoteType
  title: string
  content: string
  tags: string[]
  storage: string
  folder: string
  isStarred: boolean
  isTrashed: boolean
  createdAt: string
  updatedAt: string
}

export interface Folder {
  key: string
  name: string
  color?: string
}

export interface Storage {
  key: string
  name: string
  folders: Folder[]
}

export type SmartView = 'all' | 'starred' | 'trashed'

export interface Selection {
  kind: 'smart' | 'folder' | 'tag'
  // smart view, or `${storage}|${folder}`, or a tag name
  value: string
}

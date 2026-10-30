import type { Note } from '../types'

/**
 * Make a string safe as a file or folder name: filesystem-reserved characters
 * are replaced, whitespace is collapsed, length is capped, and an empty result
 * falls back to `fallback`.
 */
export function safeName(text: string, fallback = 'untitled'): string {
  const base = text
    .replace(/[/\\:*?"<>|]/g, '_') // filesystem-reserved characters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim()
  return base || fallback
}

/** Derive a safe filename from a note's title (`.md` unless another extension is given). */
export function exportFilename(note: Pick<Note, 'title'>, ext = 'md'): string {
  return `${safeName(note.title)}.${ext}`
}

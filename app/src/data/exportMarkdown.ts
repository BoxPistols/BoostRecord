import type { Note } from '../types'

/**
 * Derive a safe `.md` filename from a note's title: filesystem-reserved
 * characters are replaced, whitespace is collapsed, length is capped, and an
 * empty title falls back to `untitled`.
 */
export function exportFilename(note: Pick<Note, 'title'>): string {
  const base = note.title
    .replace(/[/\\:*?"<>|]/g, '_') // filesystem-reserved characters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim()
  return `${base || 'untitled'}.md`
}

import type { Note } from '../types'

/**
 * Full-text search over notes. A query is split into whitespace-separated
 * terms that are combined with AND (every term must appear), matched
 * case-insensitively across each note's title, content and tags.
 */

/** Split a raw query into lowercased AND-terms (whitespace separated). */
export function queryTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

/** True when the note contains every term across title, content and tags. */
export function noteMatches(note: Note, terms: string[]): boolean {
  if (terms.length === 0) return true
  const hay = `${note.title}\n${note.content}\n${note.tags.join(' ')}`.toLowerCase()
  return terms.every(term => hay.includes(term))
}

/** Filter notes by a raw query string; empty query returns the input as-is. */
export function filterByQuery(notes: Note[], query: string): Note[] {
  const terms = queryTerms(query)
  if (terms.length === 0) return notes
  return notes.filter(note => noteMatches(note, terms))
}

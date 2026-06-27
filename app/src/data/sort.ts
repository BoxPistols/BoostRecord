import type { Note } from '../types'

/** Sort options for the note list. */
export type SortKey = 'updated' | 'created' | 'title'
export type SortDir = 'asc' | 'desc'

export const SORT_LABELS: Record<SortKey, string> = {
  updated: '更新日',
  created: '作成日',
  title: 'タイトル'
}

/** Pure, stable-ish note sort by a key and direction (returns a new array). */
export function sortNotes(notes: Note[], key: SortKey, dir: SortDir): Note[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...notes].sort((a, b) => {
    if (key === 'title') {
      return a.title.localeCompare(b.title) * sign
    }
    const fa = key === 'created' ? a.createdAt : a.updatedAt
    const fb = key === 'created' ? b.createdAt : b.updatedAt
    return (+new Date(fa) - +new Date(fb)) * sign
  })
}

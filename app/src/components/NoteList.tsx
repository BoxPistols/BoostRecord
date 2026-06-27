import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note } from '../types'
import { sortNotes, SORT_LABELS } from '../data/sort'
import type { SortKey, SortDir } from '../data/sort'

const SORT_STORE = 'theboosters_sort'

function loadSort(): { key: SortKey; dir: SortDir } {
  try {
    const raw = JSON.parse(localStorage.getItem(SORT_STORE) || '')
    if (raw && raw.key in SORT_LABELS && (raw.dir === 'asc' || raw.dir === 'desc')) {
      return raw
    }
  } catch {
    /* fall through to default */
  }
  return { key: 'updated', dir: 'desc' }
}

interface Props {
  notes: Note[]
  activeKey: string | null
  onSelect: (key: string) => void
  query: string
  onQueryChange: (q: string) => void
  /** When set (Electron), shows a button to create a new note. */
  onNewNote?: () => void
}

const ROW_H = 58 // fixed row height enables simple, fast windowing
const OVERSCAN = 6

function shortDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * Virtualized note list: only the rows in (and just around) the viewport are
 * rendered, so hundreds of notes scroll smoothly. Sorted by Updated desc.
 */
export function NoteList({
  notes,
  activeKey,
  onSelect,
  query,
  onQueryChange,
  onNewNote
}: Props) {
  const [sort, setSort] = useState(loadSort)
  const sorted = useMemo(
    () => sortNotes(notes, sort.key, sort.dir),
    [notes, sort]
  )

  // Persist the sort choice so it survives reloads.
  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORE, JSON.stringify(sort))
    } catch {
      /* localStorage unavailable — non-fatal */
    }
  }, [sort])

  const scrollRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(800)

  // Cmd/Ctrl+F focuses the search box (no native browser find in Electron).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setViewport(el.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const total = sorted.length
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(total, Math.ceil((scrollTop + viewport) / ROW_H) + OVERSCAN)
  const windowed = sorted.slice(start, end)

  return (
    <section className="notelist">
      <div className="notelist-search">
        <input
          ref={searchRef}
          className="search-input"
          type="search"
          placeholder="検索…  (⌘/Ctrl+F)"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
      </div>
      <div className="notelist-head">
        <select
          className="sort-select"
          value={sort.key}
          onChange={e => setSort(s => ({ ...s, key: e.target.value as SortKey }))}
          title="並び替え"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          className="sort-dir"
          onClick={() =>
            setSort(s => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))
          }
          title={sort.dir === 'asc' ? '昇順' : '降順'}
        >
          {sort.dir === 'asc' ? '▲' : '▼'}
        </button>
        <span className="sort" style={{ marginLeft: 'auto' }}>
          {total} notes
        </span>
        {onNewNote && (
          <button
            className="head-btn"
            onClick={onNewNote}
            title="新規ノート (⌘/Ctrl+N)"
          >
            ＋
          </button>
        )}
      </div>
      <div
        className="notelist-scroll"
        ref={scrollRef}
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: total * ROW_H, position: 'relative' }}>
          {windowed.map((note, idx) => {
            const i = start + idx
            return (
              <div
                key={note.key}
                className={`note-row ${note.key === activeKey ? 'active' : ''}`}
                style={{
                  position: 'absolute',
                  top: i * ROW_H,
                  left: 0,
                  right: 0,
                  height: ROW_H
                }}
                onClick={() => onSelect(note.key)}
              >
                <div className="note-title">
                  <span className="ic">
                    {note.type === 'SNIPPET_NOTE' ? '〈〉' : '▤'}
                  </span>
                  {note.title || 'Untitled'}
                </div>
                <div className="note-meta">
                  {shortDate(note.updatedAt)}
                  {note.tags.length > 0 &&
                    ` · ${note.tags.map(t => `#${t}`).join(' ')}`}
                </div>
              </div>
            )
          })}
          {total === 0 && (
            <div style={{ padding: 20, color: 'var(--faint)' }}>
              {query.trim() ? '一致するノートがありません' : 'No notes'}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note } from '../types'

interface Props {
  notes: Note[]
  activeKey: string | null
  onSelect: (key: string) => void
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
export function NoteList({ notes, activeKey, onSelect }: Props) {
  const sorted = useMemo(
    () =>
      [...notes].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    [notes]
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(800)

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
      <div className="notelist-head">
        <span>⌄ Updated</span>
        <span className="sort" style={{ marginLeft: 'auto' }}>
          {total} notes
        </span>
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
            <div style={{ padding: 20, color: 'var(--faint)' }}>No notes</div>
          )}
        </div>
      </div>
    </section>
  )
}

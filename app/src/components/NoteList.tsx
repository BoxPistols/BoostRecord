import type { Note } from '../types'

interface Props {
  notes: Note[]
  activeKey: string | null
  onSelect: (key: string) => void
}

function relTime(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export function NoteList({ notes, activeKey, onSelect }: Props) {
  const sorted = [...notes].sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
  )
  return (
    <section className="notelist">
      <div className="notelist-head">
        <span>⌄ Updated</span>
        <span className="sort" style={{ marginLeft: 'auto' }}>
          {notes.length} notes
        </span>
      </div>
      <div className="notelist-scroll">
        {sorted.map(note => (
          <div
            key={note.key}
            className={`note-row ${note.key === activeKey ? 'active' : ''}`}
            onClick={() => onSelect(note.key)}
          >
            <div className="note-title">
              <span className="ic">
                {note.type === 'SNIPPET_NOTE' ? '〈〉' : '▤'}
              </span>
              {note.title || 'Untitled'}
            </div>
            <div className="note-meta">
              {relTime(note.updatedAt)}
              {note.tags.length > 0 && ` · ${note.tags.map(t => `#${t}`).join(' ')}`}
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div style={{ padding: 20, color: 'var(--faint)' }}>No notes</div>
        )}
      </div>
    </section>
  )
}

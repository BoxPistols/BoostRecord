import { useMemo, useState } from 'react'
import type { Note, Selection } from './types'
import { sampleNotes, sampleStorages } from './data/sampleNotes'
import { Sidebar } from './components/Sidebar'
import { NoteList } from './components/NoteList'
import { MarkdownEditor } from './components/MarkdownEditor'
import { Preview } from './components/Preview'

function firstTitle(content: string, fallback: string) {
  const line = content.split('\n').find(l => l.trim().length > 0)
  if (!line) return fallback
  return line.replace(/^#+\s*/, '').trim() || fallback
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>(sampleNotes)
  const [selection, setSelection] = useState<Selection>({
    kind: 'smart',
    value: 'all'
  })
  const [activeKey, setActiveKey] = useState<string | null>(
    sampleNotes[0]?.key ?? null
  )

  const visible = useMemo(() => {
    const live = notes.filter(n => !n.isTrashed)
    switch (selection.kind) {
      case 'smart':
        if (selection.value === 'starred') return live.filter(n => n.isStarred)
        if (selection.value === 'trashed') return notes.filter(n => n.isTrashed)
        return live
      case 'folder': {
        const [storage, folder] = selection.value.split('|')
        return live.filter(n => n.storage === storage && n.folder === folder)
      }
      case 'tag':
        return live.filter(n => n.tags.includes(selection.value))
    }
  }, [notes, selection])

  const active = notes.find(n => n.key === activeKey) ?? null

  function selectView(s: Selection) {
    setSelection(s)
    const live = notes.filter(n => !n.isTrashed)
    const next =
      s.kind === 'folder'
        ? live.find(n => `${n.storage}|${n.folder}` === s.value)
        : s.kind === 'tag'
          ? live.find(n => n.tags.includes(s.value))
          : visible[0]
    if (next) setActiveKey(next.key)
  }

  function updateActiveContent(content: string) {
    if (!active) return
    setNotes(prev =>
      prev.map(n =>
        n.key === active.key
          ? {
              ...n,
              content,
              title: firstTitle(content, n.title),
              updatedAt: new Date().toISOString()
            }
          : n
      )
    )
  }

  function toggleStar() {
    if (!active) return
    setNotes(prev =>
      prev.map(n =>
        n.key === active.key ? { ...n, isStarred: !n.isStarred } : n
      )
    )
  }

  const folderName = active
    ? (sampleStorages
        .find(s => s.key === active.storage)
        ?.folders.find(f => f.key === active.folder)?.name ?? active.folder)
    : ''

  return (
    <div className="app">
      <Sidebar
        storages={sampleStorages}
        notes={notes}
        selection={selection}
        onSelect={selectView}
      />
      <NoteList notes={visible} activeKey={activeKey} onSelect={setActiveKey} />
      {active ? (
        <section className="detail">
          <div className="detail-head">
            <span className="folder">📁 {folderName}</span>
            <span className="spacer" />
            <span
              className={`star ${active.isStarred ? 'on' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={toggleStar}
              title="Star"
            >
              ★
            </span>
          </div>
          <div className="split">
            <div className="pane editor">
              <MarkdownEditor
                noteKey={active.key}
                value={active.content}
                onChange={updateActiveContent}
              />
            </div>
            <Preview content={active.content} />
          </div>
        </section>
      ) : (
        <div className="empty">Select a note</div>
      )}
    </div>
  )
}

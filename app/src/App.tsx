import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note, Selection, Storage } from './types'
import { createRepository } from './data/repository'
import { filterByQuery } from './data/search'
import { Sidebar } from './components/Sidebar'
import { NoteList } from './components/NoteList'
import { MarkdownEditor } from './components/MarkdownEditor'
import { Preview } from './components/Preview'

function firstTitle(content: string, fallback: string) {
  const line = content.split('\n').find(l => l.trim().length > 0)
  if (!line) return fallback
  return line.replace(/^#+\s*/, '').trim() || fallback
}

// The data-layer seam: real `.cson` files in Electron, sample data in browser.
const repository = createRepository()

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [storages, setStorages] = useState<Storage[]>([])
  const [selection, setSelection] = useState<Selection>({
    kind: 'smart',
    value: 'all'
  })
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const canPick = typeof repository.pickStorage === 'function'
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persist a note; failures surface in the header rather than being swallowed.
  function persist(note: Note) {
    if (!repository.saveNote) return
    repository.saveNote(note).then(
      () => setSaveError(null),
      e => setSaveError(e instanceof Error ? e.message : String(e))
    )
  }

  // Debounced autosave for rapid edits (typing); coalesces to the latest note.
  function scheduleSave(note: Note) {
    if (!repository.saveNote) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(note), 600)
  }

  async function handlePickStorage() {
    if (!repository.pickStorage) return
    try {
      setPickError(null)
      const res = await repository.pickStorage()
      if (!res) return
      setStorages(res.storages)
      setNotes(res.notes)
      setSelection({ kind: 'smart', value: 'all' })
      setActiveKey(res.notes[0]?.key ?? null)
    } catch (e) {
      setPickError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    let alive = true
    repository.load().then(({ storages, notes }) => {
      if (!alive) return
      setStorages(storages)
      setNotes(notes)
      setActiveKey(prev => prev ?? notes[0]?.key ?? null)
    })
    return () => {
      alive = false
    }
  }, [])

  const visible = useMemo(() => {
    const live = notes.filter(n => !n.isTrashed)
    let base: Note[] = live
    switch (selection.kind) {
      case 'smart':
        if (selection.value === 'starred') base = live.filter(n => n.isStarred)
        else if (selection.value === 'trashed')
          base = notes.filter(n => n.isTrashed)
        break
      case 'folder': {
        const [storage, folder] = selection.value.split('|')
        base = live.filter(n => n.storage === storage && n.folder === folder)
        break
      }
      case 'tag':
        base = live.filter(n => n.tags.includes(selection.value))
        break
    }
    // Refine the current view by the search query (AND across terms).
    return filterByQuery(base, query)
  }, [notes, selection, query])

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
    const updated: Note = {
      ...active,
      content,
      title: firstTitle(content, active.title),
      updatedAt: new Date().toISOString()
    }
    setNotes(prev => prev.map(n => (n.key === updated.key ? updated : n)))
    scheduleSave(updated) // debounced write-back
  }

  function toggleStar() {
    if (!active) return
    const updated: Note = { ...active, isStarred: !active.isStarred }
    setNotes(prev => prev.map(n => (n.key === updated.key ? updated : n)))
    persist(updated) // immediate write-back (single action)
  }

  const folderName = active
    ? (storages
        .find(s => s.key === active.storage)
        ?.folders.find(f => f.key === active.folder)?.name ?? active.folder)
    : ''

  return (
    <div className="app">
      <Sidebar
        storages={storages}
        notes={notes}
        selection={selection}
        onSelect={selectView}
        onPickStorage={canPick ? handlePickStorage : undefined}
      />
      <NoteList
        notes={visible}
        activeKey={activeKey}
        onSelect={setActiveKey}
        query={query}
        onQueryChange={setQuery}
      />
      {active ? (
        <section className="detail">
          <div className="detail-head">
            <span className="folder">📁 {folderName}</span>
            {saveError && (
              <span className="save-error" title={saveError}>
                ⚠ 保存に失敗しました
              </span>
            )}
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
        <div className="empty">
          {notes.length === 0 && canPick ? (
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              <div style={{ fontSize: 15, color: 'var(--fg)', marginBottom: 6 }}>
                ノートがありません
              </div>
              <div style={{ marginBottom: 14 }}>
                Boostnote のストレージフォルダ（<code>boostnote.json</code> が
                あるフォルダ）を開くと、ノートが読み込まれます。
              </div>
              <button className="btn-primary" onClick={handlePickStorage}>
                📂 ストレージフォルダを開く
              </button>
              {pickError && (
                <div style={{ color: 'var(--accent)', marginTop: 10 }}>
                  {pickError}
                </div>
              )}
            </div>
          ) : (
            'Select a note'
          )}
        </div>
      )}
    </div>
  )
}

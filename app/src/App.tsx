import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note, Selection, Storage } from './types'
import { createRepository } from './data/repository'
import { filterByQuery } from './data/search'
import { Sidebar } from './components/Sidebar'
import { NoteList } from './components/NoteList'
import { MarkdownEditor } from './components/MarkdownEditor'
import { Preview } from './components/Preview'
import { TagEditor } from './components/TagEditor'

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
  const canCreate = typeof repository.createNote === 'function'
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const newNoteRef = useRef<() => void>(() => {})

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

  // Cmd/Ctrl+N creates a new note (ref keeps the handler fresh without re-binding).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        newNoteRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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

  function updateTags(tags: string[]) {
    if (!active) return
    const updated: Note = {
      ...active,
      tags,
      updatedAt: new Date().toISOString()
    }
    setNotes(prev => prev.map(n => (n.key === updated.key ? updated : n)))
    persist(updated)
  }

  function moveToFolder(folder: string) {
    if (!active || folder === active.folder) return
    const updated: Note = {
      ...active,
      folder,
      updatedAt: new Date().toISOString()
    }
    setNotes(prev => prev.map(n => (n.key === updated.key ? updated : n)))
    persist(updated)
  }

  // Create a new note in the selected folder (or the first folder otherwise).
  async function handleNewNote() {
    if (!repository.createNote) return
    let storage = storages[0]?.key
    let folder = storages[0]?.folders[0]?.key
    if (selection.kind === 'folder') {
      const [s, f] = selection.value.split('|')
      storage = s
      folder = f
    }
    try {
      setSaveError(null)
      const note = await repository.createNote({ storage, folder })
      setNotes(prev => [note, ...prev])
      // Show the new (empty, untagged) note where it will actually appear.
      setSelection(
        storage && folder
          ? { kind: 'folder', value: `${storage}|${folder}` }
          : { kind: 'smart', value: 'all' }
      )
      setActiveKey(note.key)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }
  newNoteRef.current = handleNewNote

  function setTrashed(isTrashed: boolean) {
    if (!active) return
    const updated: Note = {
      ...active,
      isTrashed,
      updatedAt: new Date().toISOString()
    }
    setNotes(prev => prev.map(n => (n.key === updated.key ? updated : n)))
    persist(updated)
    setActiveKey(null) // the note leaves the current view
  }

  async function deleteActiveForever() {
    if (!active || !repository.deleteNote) return
    if (!window.confirm('このノートを完全に削除しますか？元に戻せません。')) return
    const key = active.key
    try {
      setSaveError(null)
      await repository.deleteNote(key)
      setNotes(prev => prev.filter(n => n.key !== key))
      setActiveKey(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  const activeFolders = active
    ? (storages.find(s => s.key === active.storage)?.folders ?? [])
    : []
  const folderName =
    activeFolders.find(f => f.key === active?.folder)?.name ??
    active?.folder ??
    ''
  const canMove = typeof repository.saveNote === 'function' && activeFolders.length > 0

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
        onNewNote={canCreate ? handleNewNote : undefined}
      />
      {active ? (
        <section className="detail">
          <div className="detail-head">
            {canMove && !active.isTrashed ? (
              <label className="folder">
                📁{' '}
                <select
                  className="folder-select"
                  value={active.folder}
                  onChange={e => moveToFolder(e.target.value)}
                  title="フォルダを移動"
                >
                  {activeFolders.map(f => (
                    <option key={f.key} value={f.key}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="folder">📁 {folderName}</span>
            )}
            {saveError && (
              <span className="save-error" title={saveError}>
                ⚠ 保存に失敗しました
              </span>
            )}
            <span className="spacer" />
            {active.isTrashed ? (
              <>
                <button
                  className="head-btn"
                  onClick={() => setTrashed(false)}
                  title="復元"
                >
                  ♻ 復元
                </button>
                {repository.deleteNote && (
                  <button
                    className="head-btn danger"
                    onClick={deleteActiveForever}
                    title="完全に削除"
                  >
                    ✕ 完全削除
                  </button>
                )}
              </>
            ) : (
              <>
                <span
                  className={`star ${active.isStarred ? 'on' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={toggleStar}
                  title="Star"
                >
                  ★
                </span>
                {repository.saveNote && (
                  <button
                    className="head-btn"
                    onClick={() => setTrashed(true)}
                    title="ゴミ箱へ移動"
                  >
                    🗑
                  </button>
                )}
              </>
            )}
          </div>
          {!active.isTrashed && (
            <TagEditor
              key={active.key}
              tags={active.tags}
              onChange={updateTags}
            />
          )}
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
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 12 }}>ノートを選択してください</div>
              {canCreate && (
                <button className="btn-primary" onClick={handleNewNote}>
                  ＋ 新規ノート
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

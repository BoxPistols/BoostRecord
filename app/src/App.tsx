import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronsRight,
  Download,
  Folder,
  FolderOpen,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  TriangleAlert,
  Upload,
  X
} from 'lucide-react'
import type { Note, Selection, Storage } from './types'
import { canUseFolder, createRepository } from './data/repository'
import { getStorageMode, setStorageMode } from './data/storageMode'
import type { StorageMode } from './data/storageMode'
import { filterByQuery } from './data/search'
import { Sidebar } from './components/Sidebar'
import { NoteList } from './components/NoteList'
import { MarkdownEditor } from './components/MarkdownEditor'
import { Preview } from './components/Preview'
import { TagEditor } from './components/TagEditor'
import { ShortcutHelp } from './components/ShortcutHelp'
import { Splitter } from './components/Splitter'
import { ModeSwitcher } from './components/ModeSwitcher'
import { FindBar } from './components/FindBar'
import { Preferences } from './components/Preferences'
import type { PrefTab } from './components/Preferences'
import { THEMES, parseConfig, themeVariables } from './config'
import type { Config } from './config'
import { useNoteFind } from './find/useNoteFind'
import {
  NAV,
  SPLIT,
  clamp,
  listPaneWidth,
  navPaneWidth,
  nextPaneMode,
  nextViewMode,
  parseLayout,
  resizeList,
  togglePreview
} from './layout'
import type { Layout } from './layout'

const LAYOUT_STORE = 'boostrecord.layout'
const CONFIG_STORE = 'boostrecord.config'

function loadConfig(): Config {
  try {
    return parseConfig(localStorage.getItem(CONFIG_STORE))
  } catch {
    return parseConfig(null)
  }
}

function loadLayout(): Layout {
  try {
    return parseLayout(localStorage.getItem(LAYOUT_STORE))
  } catch {
    return parseLayout(null)
  }
}

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
  const [showHelp, setShowHelp] = useState(false)
  const [layout, setLayout] = useState(loadLayout)
  const [config, setConfig] = useState(loadConfig)
  const [prefsTab, setPrefsTab] = useState<PrefTab | null>(null)
  const isDark = THEMES[config.ui.theme].dark
  const appRef = useRef<HTMLDivElement | null>(null)
  const splitRef = useRef<HTMLDivElement | null>(null)
  // ドラッグ中は保存しない（離したときに 1 回だけ書く）
  const resizing = useRef(false)

  const canPick = typeof repository.pickStorage === 'function'
  const canCreate = typeof repository.createNote === 'function'
  const canExport = typeof repository.exportNote === 'function'
  // OPFS（ブラウザの中に保存）のときだけ、zip で出し入れする
  const canArchive =
    typeof repository.importArchive === 'function' &&
    typeof repository.exportArchive === 'function'
  // 保存先が無いブラウザ（Safari 18 以前など）は見本データで動く。編集しても
  // 再読み込みで消えるので、そのことを常に出しておく
  const isSample = typeof repository.saveNote !== 'function'
  // Chrome・Edge では、ブラウザの中と PC のフォルダを切り替えられる（デスクトップ版の中では出さない）
  const canSwitchStorage = !window.boostnote && canUseFolder()
  const storageMode = getStorageMode()

  function switchStorage(mode: StorageMode) {
    const message =
      mode === 'folder'
        ? 'PC のフォルダ（デスクトップ版と同じストレージ）で使うよう切り替えて、読み込み直します。ブラウザの中のノートは消えずに残り、戻せばまた使えます。'
        : 'このブラウザの中に保存するよう切り替えて、読み込み直します。フォルダのノートは消えずに残り、戻せばまた使えます。'
    if (!window.confirm(message)) return
    if (!setStorageMode(mode)) {
      window.alert('切り替えを保存できませんでした。このブラウザがサイトのデータの保存を止めている可能性があります（プライベートウィンドウなど）。')
      return
    }
    window.location.reload()
  }
  const archiveInput = useRef<HTMLInputElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const newNoteRef = useRef<() => void>(() => {})
  // ⌘/Ctrl+F。ノートを開いているときだけノート内検索を開く（無ければ一覧の検索へ任せる）
  const openFindRef = useRef<(() => boolean) | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

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

  // デスクトップ版と同じキー。エディタにフォーカスがあっても効くよう capture で拾う
  //   ⌘/Ctrl+B サイドバー、⌘/Ctrl+Shift+B ノート一覧（どちらも 展開→畳む→隠す）
  //   ⌘/Ctrl+E Split と全面プレビュー、⌘/Ctrl+Shift+E Editor→Split→Preview
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === ',' && !e.shiftKey) {
        e.preventDefault()
        setPrefsTab(t => t ?? 'UI')
        return
      }
      // デスクトップ版と同じく ⌘/Ctrl+F はノート内検索。Shift 付きは横取りしない
      if (key === 'f' && !e.shiftKey && openFindRef.current?.()) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      let change: ((l: Layout) => Layout) | null = null
      if (key === 'b' && !e.shiftKey)
        change = l => ({ ...l, navMode: nextPaneMode(l.navMode) })
      else if (key === 'b')
        change = l => ({ ...l, listMode: nextPaneMode(l.listMode) })
      else if (key === 'e' && !e.shiftKey)
        change = l => ({ ...l, viewMode: togglePreview(l.viewMode) })
      else if (key === 'e')
        change = l => ({ ...l, viewMode: nextViewMode(l.viewMode) })
      if (!change) return
      e.preventDefault()
      e.stopPropagation()
      setLayout(change)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    if (resizing.current) return
    try {
      localStorage.setItem(LAYOUT_STORE, JSON.stringify(layout))
    } catch {
      // 保存できなくても、今の画面では効く
    }
  }, [layout])

  // テーマとフォントは :root の CSS 変数で当てる。部品は var(--*) を読むだけ
  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(themeVariables(config))) root.style.setProperty(k, v)
    root.style.colorScheme = isDark ? 'dark' : 'light'
    root.dataset.theme = config.ui.theme
    try {
      localStorage.setItem(CONFIG_STORE, JSON.stringify(config))
    } catch {
      // 保存できなくても、今の画面では効く
    }
  }, [config, isDark])

  function endResize() {
    resizing.current = false
    // 中身は変えずに作り直し、保存の effect を走らせる
    setLayout(l => ({ ...l }))
  }

  function appLeft() {
    return appRef.current?.getBoundingClientRect().left ?? 0
  }

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

  // 表示していない面は探さない（デスクトップ版と同じく、全面プレビューのときだけプレビューを探す）
  const findTarget = layout.viewMode === 'PREVIEW' ? 'PREVIEW' : 'EDITOR'
  const noteFind = useNoteFind({
    noteKey: active?.key ?? null,
    content: active?.content ?? '',
    target: findTarget,
    previewRef
  })
  openFindRef.current = active
    ? () => {
        noteFind.openFind()
        return true
      }
    : null

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

  async function handleExport() {
    if (!active || !repository.exportNote) return
    try {
      setSaveError(null)
      await repository.exportNote(active)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleExportArchive() {
    if (!repository.exportArchive) return
    try {
      setSaveError(null)
      await repository.exportArchive()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleImportArchive(file: File) {
    if (!repository.importArchive) return
    // 取り込みは置き換え。今あるノートがあれば、消えることを先に伝える
    const live = notes.length
    if (
      live > 0 &&
      !window.confirm(
        `このブラウザにある ${live} 件のノートを、zip の中身で置き換えます。今のノートは消えます。先に「zip で書き出す」で保存しておくことをおすすめします。続けますか？`
      )
    ) {
      return
    }
    try {
      setSaveError(null)
      const res = await repository.importArchive(file)
      setStorages(res.storages)
      setNotes(res.notes)
      setSelection({ kind: 'smart', value: 'all' })
      setActiveKey(res.notes[0]?.key ?? null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
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

  async function handleEmptyTrash() {
    if (!repository.deleteNote) return
    const trashed = notes.filter(n => n.isTrashed)
    if (trashed.length === 0) return
    if (
      !window.confirm(
        `ゴミ箱の ${trashed.length} 件を完全に削除しますか？元に戻せません。`
      )
    ) {
      return
    }
    try {
      setSaveError(null)
      for (const n of trashed) await repository.deleteNote(n.key)
      const trashedKeys = new Set(trashed.map(n => n.key))
      setNotes(prev => prev.filter(n => !trashedKeys.has(n.key)))
      if (active && trashedKeys.has(active.key)) setActiveKey(null)
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

  const navWidth = navPaneWidth(layout)
  const listWidth = listPaneWidth(layout)
  const cycleNav = () => setLayout(l => ({ ...l, navMode: nextPaneMode(l.navMode) }))
  const cycleList = () =>
    setLayout(l => ({ ...l, listMode: nextPaneMode(l.listMode) }))

  return (
    <div className="app" ref={appRef}>
      {layout.navMode !== 'HIDDEN' && (
        <Sidebar
          width={navWidth}
          folded={layout.navMode === 'FOLDED'}
          onToggle={cycleNav}
          storages={storages}
          notes={notes}
          selection={selection}
          onSelect={selectView}
          onPickStorage={canPick ? handlePickStorage : undefined}
          onEmptyTrash={
            typeof repository.deleteNote === 'function'
              ? handleEmptyTrash
              : undefined
          }
          onShowHelp={() => setShowHelp(true)}
          onShowPreferences={() => setPrefsTab('UI')}
          onImportArchive={
            canArchive ? () => archiveInput.current?.click() : undefined
          }
          onExportArchive={canArchive ? handleExportArchive : undefined}
        />
      )}
      {layout.navMode === 'EXPANDED' && (
        <Splitter
          label="サイドバーの幅"
          onDrag={x => {
            resizing.current = true
            setLayout(l => ({
              ...l,
              navWidth: clamp(x - appLeft(), NAV.min, NAV.max)
            }))
          }}
          onEnd={endResize}
        />
      )}
      {canArchive && (
        <input
          ref={archiveInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={e => {
            const file = e.target.files?.[0]
            // 同じファイルを続けて選んでも change が起きるよう空に戻す
            e.target.value = ''
            if (file) handleImportArchive(file)
          }}
        />
      )}
      <NoteList
        notes={visible}
        activeKey={activeKey}
        onSelect={setActiveKey}
        query={query}
        onQueryChange={setQuery}
        onNewNote={canCreate ? handleNewNote : undefined}
        width={listWidth}
        folded={layout.listMode === 'FOLDED'}
        hidden={layout.listMode === 'HIDDEN'}
        onToggle={cycleList}
      />
      {layout.listMode !== 'HIDDEN' && (
        <Splitter
          label="ノート一覧の幅"
          onDrag={x => {
            resizing.current = true
            setLayout(l => resizeList(l, x - appLeft() - navPaneWidth(l)))
          }}
          onEnd={endResize}
        />
      )}
      {(layout.navMode === 'HIDDEN' || layout.listMode === 'HIDDEN') && (
        // 隠したペインはキーでしか戻せないと気付けないので、左下に戻す口を残す
        <div className="pane-restore">
          {layout.navMode === 'HIDDEN' && (
            <button
              className="pane-toggle"
              onClick={cycleNav}
              title="サイドバーを出す (⌘/Ctrl+B)"
              aria-label="サイドバーを出す"
            >
              <ChevronsRight size={16} aria-hidden />
            </button>
          )}
          {layout.listMode === 'HIDDEN' && (
            <button
              className="pane-toggle"
              onClick={cycleList}
              title="ノート一覧を出す (⌘/Ctrl+Shift+B)"
              aria-label="ノート一覧を出す"
            >
              <ChevronsRight size={16} aria-hidden />
            </button>
          )}
        </div>
      )}
      {active ? (
        <section className="detail">
          <div className="detail-head">
            {canMove && !active.isTrashed ? (
              <label className="folder">
                <Folder className="icon" size={15} aria-hidden />
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
              <span className="folder">
                <Folder className="icon" size={15} aria-hidden /> {folderName}
              </span>
            )}
            {saveError && (
              <span className="save-error" title={saveError}>
                <TriangleAlert className="icon" size={13} aria-hidden /> 保存に失敗しました
              </span>
            )}
            {isSample && (
              <span
                className="save-error"
                title="このブラウザには保存先がありません。Chrome・Edge・Firefox で開くと、自分のノートを保存できます。"
              >
                見本データです。このブラウザでは保存されません
              </span>
            )}
            <span className="spacer" />
            <ModeSwitcher
              mode={layout.viewMode}
              onChange={viewMode => setLayout(l => ({ ...l, viewMode }))}
            />
            {active.isTrashed ? (
              <>
                <button
                  className="head-btn"
                  onClick={() => setTrashed(false)}
                  title="復元"
                >
                  <RotateCcw className="icon" size={13} aria-hidden /> 復元
                </button>
                {repository.deleteNote && (
                  <button
                    className="head-btn danger"
                    onClick={deleteActiveForever}
                    title="完全に削除"
                  >
                    <X className="icon" size={13} aria-hidden /> 完全削除
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  className={`head-icon star ${active.isStarred ? 'on' : ''}`}
                  onClick={toggleStar}
                  title="お気に入り"
                  aria-label="お気に入り"
                  aria-pressed={active.isStarred}
                >
                  <Star
                    size={16}
                    fill={active.isStarred ? 'currentColor' : 'none'}
                    aria-hidden
                  />
                </button>
                {canExport && (
                  <button
                    className="head-btn"
                    onClick={handleExport}
                    title="Markdown でエクスポート"
                  >
                    <Download className="icon" size={13} aria-hidden /> md
                  </button>
                )}
                {repository.saveNote && (
                  <button
                    className="head-btn"
                    onClick={() => setTrashed(true)}
                    title="ゴミ箱へ移動"
                    aria-label="ゴミ箱へ移動"
                  >
                    <Trash2 size={14} aria-hidden />
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
          <div className={`split view-${layout.viewMode.toLowerCase()}`} ref={splitRef}>
            {/* 全面プレビューでもエディタは外さない（元に戻す履歴を失わない） */}
            <div
              className="pane editor"
              style={
                layout.viewMode === 'SPLIT'
                  ? { flex: `0 0 ${layout.editorPercent}%` }
                  : undefined
              }
            >
              <MarkdownEditor
                noteKey={active.key}
                value={active.content}
                onChange={updateActiveContent}
                onView={noteFind.onView}
                settings={{ ...config.editor, dark: isDark }}
              />
            </div>
            {layout.viewMode === 'SPLIT' && (
              <Splitter
                label="エディタとプレビューの幅"
                onDrag={x => {
                  const rect = splitRef.current?.getBoundingClientRect()
                  if (!rect || rect.width === 0) return
                  resizing.current = true
                  setLayout(l => ({
                    ...l,
                    editorPercent: clamp(
                      ((x - rect.left) / rect.width) * 100,
                      SPLIT.min,
                      SPLIT.max
                    )
                  }))
                }}
                onEnd={endResize}
              />
            )}
            <Preview content={active.content} rootRef={previewRef} breaks={config.preview.breaks} />
            {noteFind.find && (
              <FindBar
                query={noteFind.find.query}
                index={noteFind.find.index}
                count={noteFind.find.count}
                focusToken={noteFind.find.focusToken}
                target={findTarget === 'PREVIEW' ? 'プレビュー' : 'エディタ'}
                onChange={noteFind.setQuery}
                onStep={noteFind.step}
                onClose={noteFind.close}
                replaceOpen={noteFind.find.replaceOpen}
                replaceValue={noteFind.find.replace}
                onToggleReplace={noteFind.toggleReplace}
                onReplaceChange={noteFind.setReplace}
                {...(findTarget === 'EDITOR'
                  ? { onReplace: noteFind.replace, onReplaceAll: noteFind.replaceAll }
                  : {})}
              />
            )}
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
                <FolderOpen className="icon" size={15} aria-hidden /> ストレージフォルダを開く
              </button>
              {canSwitchStorage && (
                <div style={{ marginTop: 10 }}>
                  <button className="btn-ghost-inline" onClick={() => switchStorage('browser')}>
                    フォルダを使わず、このブラウザの中に書く
                  </button>
                </div>
              )}
              {pickError && (
                <div style={{ color: 'var(--accent)', marginTop: 10 }}>
                  {pickError}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              {canArchive && notes.length === 0 && (
                <div style={{ marginBottom: 14 }}>
                  {canSwitchStorage
                    ? 'ノートはこのブラウザの中に保存します。デスクトップ版と同じフォルダで使うときは、設定の「ストレージ」から切り替えられます。'
                    : 'このブラウザではフォルダを直接開けないため、ノートはブラウザの中に保存します。デスクトップ版のストレージフォルダを zip にして「zip を取り込む」から入れられます。'}
                </div>
              )}
              <div style={{ marginBottom: 12 }}>ノートを選択してください</div>
              {saveError && (
                <div style={{ color: 'var(--accent)', marginBottom: 10 }}>
                  {saveError}
                </div>
              )}
              {canCreate && (
                <button className="btn-primary" onClick={handleNewNote}>
                  <Plus className="icon" size={15} aria-hidden /> 新規ノート
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <ShortcutHelp open={showHelp} onClose={() => setShowHelp(false)} />
      <Preferences
        open={prefsTab !== null}
        initialTab={prefsTab ?? 'UI'}
        config={config}
        onChange={setConfig}
        onClose={() => setPrefsTab(null)}
        storageSummary={
          <>
            <p>
              {isSample
                ? 'このブラウザには保存先がありません。見本のノートで動いていて、編集しても再読み込みで消えます。Chrome・Edge・Firefox で開くと、自分のノートを保存できます。'
                : canArchive
                  ? 'ノートはこのブラウザの中（Origin Private File System）に保存しています。サイトのデータを消すと消えるので、zip で書き出して残してください。展開するとデスクトップ版のストレージとして開けます。'
                  : canPick
                    ? '選んだストレージフォルダに直接読み書きしています。デスクトップ版と同じフォルダを開けます。'
                    : 'デスクトップ版のストレージを読み書きしています。'}
            </p>
            {storages.length > 0 && (
              <table className="shortcut-table">
                <tbody>
                  {storages.map(s => (
                    <tr key={s.key}>
                      <td className="shortcut-keys">{s.name}</td>
                      <td>
                        フォルダ {s.folders.length} 件・ノート{' '}
                        {notes.filter(n => n.storage === s.key && !n.isTrashed).length} 件
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="prefs-actions">
              {canSwitchStorage && (
                <button
                  className="btn-ghost-inline"
                  onClick={() => switchStorage(storageMode === 'folder' ? 'browser' : 'folder')}
                >
                  {storageMode === 'folder'
                    ? 'このブラウザの中に保存する'
                    : 'PC のフォルダで使う（デスクトップ版と同じストレージ）'}
                </button>
              )}
              {canPick && (
                <button className="btn-ghost-inline" onClick={handlePickStorage}>
                  <FolderOpen className="icon" size={14} aria-hidden /> ストレージを追加
                </button>
              )}
              {canArchive && (
                <>
                  <button className="btn-ghost-inline" onClick={handleExportArchive}>
                    <Download className="icon" size={14} aria-hidden /> zip で書き出す
                  </button>
                  <button className="btn-ghost-inline" onClick={() => archiveInput.current?.click()}>
                    <Upload className="icon" size={14} aria-hidden /> zip を取り込む
                  </button>
                </>
              )}
            </div>
          </>
        }
      />
    </div>
  )
}

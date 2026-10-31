import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronsRight,
  Download,
  Link2,
  ListTree,
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
import { canSwitchBrowserStorage, createRepository } from './data/repository'
import { getStorageMode, setStorageMode } from './data/storageMode'
import type { StorageMode } from './data/storageMode'
import { filterByQuery } from './data/search'
import { Sidebar } from './components/Sidebar'
import { NoteList } from './components/NoteList'
import { MarkdownEditor } from './components/MarkdownEditor'
import { Preview } from './components/Preview'
import { TagEditor } from './components/TagEditor'
import { ShortcutHelp } from './components/ShortcutHelp'
import { ExportDialog } from './components/ExportDialog'
import { NoteLinkPanel } from './components/NoteLinkPanel'
import { TocPane } from './components/TocPane'
import { EditorView } from '@codemirror/view'
import { hashForNote, noteKeyFromHash, noteLink } from './noteUrl'
import { runExport } from './data/exportFiles'
import type { ExportFormat, ExportScope } from './data/exportPlan'
import { Splitter } from './components/Splitter'
import { ModeSwitcher } from './components/ModeSwitcher'
import { FindBar } from './components/FindBar'
import { TodoStatus } from './components/TodoStatus'
import { todoStatus, toggleTaskLine } from './markdown/taskList'
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
import { displayCombo, matches, recording } from './hotkeys'

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
// 設定で保存先を切り替えると差し替える（ページは読み込み直さない）。
// 別のタブで切り替えても、このタブの repository は変わらない
let repository = createRepository()
const storageModeAtStart = getStorageMode()

const toggleToc = (c: Config): Config => ({ ...c, preview: { ...c.preview, showToc: !c.preview.showToc } })

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
  // エクスポートのダイアログ。開いたときに選んでおく範囲を持つ
  const [exportScope, setExportScope] = useState<ExportScope | null>(null)
  // ノートの見出しの「リンク」で開く欄
  const [linkOpen, setLinkOpen] = useState(false)
  // リンクのコピーや、リンク先が無かったことを一時的に知らせる
  const [notice, setNotice] = useState<string | null>(null)
  const [layout, setLayout] = useState(loadLayout)
  const [config, setConfig] = useState(loadConfig)
  // キーの割り当ては設定で変わる。キー入力の処理は付け直さず、いつも今の値を見る
  const hotkeyRef = useRef(config.hotkey)
  hotkeyRef.current = config.hotkey
  const [prefsTab, setPrefsTab] = useState<PrefTab | null>(null)
  const isDark = THEMES[config.ui.theme].dark
  const appRef = useRef<HTMLDivElement | null>(null)
  const splitRef = useRef<HTMLDivElement | null>(null)
  // ドラッグ中は保存しない（離したときに 1 回だけ書く）
  const resizing = useRef(false)

  const canPick = typeof repository.pickStorage === 'function'
  const canCreate = typeof repository.createNote === 'function'
  // OPFS（ブラウザの中に保存）のときだけ、zip で出し入れする
  const canArchive =
    typeof repository.importArchive === 'function' &&
    typeof repository.exportArchive === 'function'
  // 保存先が無いブラウザ（Safari 18 以前など）は見本データで動く。編集しても
  // 再読み込みで消えるので、そのことを常に出しておく
  const isSample = typeof repository.saveNote !== 'function'
  // Chrome・Edge では、ブラウザの中と PC のフォルダを切り替えられる（デスクトップ版の中では出さない）
  const canSwitchStorage = !window.boostnote && canSwitchBrowserStorage()
  const [storageMode, setStorageModeState] = useState<StorageMode>(storageModeAtStart)
  // 切り替えた結果を設定の「ストレージ」に出す（何が起きたかを伝える）
  const [switchNotice, setSwitchNotice] = useState<string | null>(null)

  /**
   * 保存先を切り替える。ページは読み込み直さず、その場でノートを読み直す。
   * どちらのノートも消えずに残り、戻せばまた使える。
   * PC のフォルダへは、フォルダを選ぶ（または前回のフォルダを許可する）まで切り替えない
   */
  const switching = useRef(false)
  async function switchStorage(mode: StorageMode) {
    // 続けて押されても、切り替えは 1 つずつ行う
    if (switching.current) return
    switching.current = true
    try {
      await switchStorageOnce(mode)
    } finally {
      switching.current = false
    }
  }
  async function switchStorageOnce(mode: StorageMode) {
    setSwitchNotice(null)
    // 切り替える前に、打ちかけの編集を今の保存先へ書き終える。書けなければ切り替えない
    try {
      await flushSaves()
    } catch (e) {
      setSwitchNotice(`ノートを保存できなかったので、切り替えを止めました。${e instanceof Error ? e.message : String(e)}`)
      return
    }
    const previous = getStorageMode()
    if (!setStorageMode(mode)) {
      setSwitchNotice('切り替えを保存できませんでした。このブラウザがサイトのデータの保存を止めている可能性があります（プライベートウィンドウなど）。')
      return
    }
    const next = createRepository()
    let loaded: { storages: Storage[]; notes: Note[] } | null
    try {
      loaded = mode === 'folder' && next.pickStorage ? await next.pickStorage() : await next.load()
    } catch (e) {
      loaded = null
      setSwitchNotice(`開けませんでした。${e instanceof Error ? e.message : String(e)}`)
    }
    // ブラウザの中の保存は、開けないと空の一覧を返す（開ければ保存先が必ず 1 つある）
    if (loaded && mode === 'browser' && loaded.storages.length === 0) {
      loaded = null
      setSwitchNotice('このブラウザの中の保存先を開けなかったので、切り替えを止めました。')
    }
    // 読み込みを待つ間に打った編集も、元の保存先へ書き終えてから差し替える
    if (loaded) {
      try {
        while (pendingSave.current || inflight.current.size) await flushSaves()
      } catch (e) {
        loaded = null
        setSwitchNotice(`ノートを保存できなかったので、切り替えを止めました。${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (!loaded) {
      // フォルダを選ぶのをやめた・開けなかった。元の保存先のまま
      setStorageMode(previous)
      return
    }
    repository = next
    setStorages(loaded.storages)
    setNotes(loaded.notes)
    setSelection({ kind: 'smart', value: 'all' })
    setActiveKey(loaded.notes[0]?.key ?? null)
    setPickError(null)
    setStorageModeState(mode)
    setSwitchNotice(
      mode === 'folder'
        ? `PC のフォルダ「${loaded.storages[0]?.name ?? ''}」に切り替えました。ブラウザの中のノートは残っていて、戻せばまた使えます。`
        : 'このブラウザの中の保存に切り替えました。フォルダのノートはそのまま残っていて、戻せばまた使えます。'
    )
  }
  const archiveInput = useRef<HTMLInputElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const newNoteRef = useRef<() => void>(() => {})
  // ⌘/Ctrl+F。ノートを開いているときだけノート内検索を開く（無ければ一覧の検索へ任せる）
  const openFindRef = useRef<(() => boolean) | null>(null)
  // ⌘/Ctrl+Shift+K。ノートを開いているときだけ、そのノートへのリンクをコピーする
  const copyLinkRef = useRef<(() => boolean) | null>(null)
  // 目次から飛ぶときに、エディタのカーソルも見出しの行へ動かす
  const editorViewRef = useRef<EditorView | null>(null)
  // 戻る・進むはいつも今の一覧とノートで開く（popstate は一度だけ付ける）
  const openNoteRef = useRef<(key: string) => void>(() => {})
  // 読み込みが終わるまでは、URL の # を消さない
  const hashReady = useRef(false)
  // 直前に開いていたノート。ノートからノートへ移ったときだけ履歴を足す
  const shownKey = useRef<string | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

  // Persist a note; failures surface in the header rather than being swallowed.
  // 書き込み中のもの。保存先を切り替える前に待つ
  const inflight = useRef<Set<Promise<void>>>(new Set())
  const pendingSave = useRef<Note | null>(null)

  function persist(note: Note): Promise<void> {
    if (!repository.saveNote) return Promise.resolve()
    const p = repository.saveNote(note)
    inflight.current.add(p)
    p.then(
      () => setSaveError(null),
      e => setSaveError(e instanceof Error ? e.message : String(e))
    ).finally(() => inflight.current.delete(p))
    return p
  }

  // Debounced autosave for rapid edits (typing); coalesces to the latest note.
  function scheduleSave(note: Note) {
    if (!repository.saveNote) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pendingSave.current = note
    saveTimer.current = setTimeout(() => {
      pendingSave.current = null
      persist(note)
    }, 600)
  }

  /** 待っている自動保存をすぐ書き、書き込み中のものと合わせて終わるまで待つ。失敗は投げる */
  async function flushSaves() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    const note = pendingSave.current
    pendingSave.current = null
    if (note) persist(note)
    await Promise.all([...inflight.current])
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
    const first = repository
    first.load().then(({ storages, notes }) => {
      // 読み終わる前に保存先を切り替えていたら、古い保存先の結果は捨てる
      if (!alive || first !== repository) return
      setStorages(storages)
      setNotes(notes)
      // URL の # がノートを指していれば、そのノートを開く
      const start = noteKeyFromHash(location.hash)
      const target = start ? notes.find(n => n.key === start) : undefined
      if (start && !target) setNotice('URL のノートが見つかりません。別のストレージにあるか、消されています')
      if (target?.isTrashed) setSelection({ kind: 'smart', value: 'trashed' })
      setActiveKey(prev => prev ?? target?.key ?? notes[0]?.key ?? null)
      hashReady.current = true
    })
    return () => {
      alive = false
    }
  }, [])

  // 設定の「ホットキー」のキー。エディタにフォーカスがあっても効くよう capture で拾う
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (recording.active) return
      const k = hotkeyRef.current
      const on = (combo: string) => matches(e, combo)
      const take = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (on(k.newNote)) {
        take()
        newNoteRef.current()
        return
      }
      if (on(k.openPrefs)) {
        take()
        setPrefsTab(t => t ?? 'UI')
        return
      }
      if (on(k.toggleToc)) {
        take()
        setConfig(toggleToc)
        return
      }
      if (on(k.copyNoteLink) && copyLinkRef.current?.()) {
        take()
        return
      }
      // ノートを開いていないときは、一覧の検索（NoteList）へ回す
      if (on(k.findInNote) && openFindRef.current?.()) {
        take()
        return
      }
      let change: ((l: Layout) => Layout) | null = null
      if (on(k.toggleSidebar)) change = l => ({ ...l, navMode: nextPaneMode(l.navMode) })
      else if (on(k.toggleNoteList)) change = l => ({ ...l, listMode: nextPaneMode(l.listMode) })
      else if (on(k.togglePreview)) change = l => ({ ...l, viewMode: togglePreview(l.viewMode) })
      else if (on(k.cycleView)) change = l => ({ ...l, viewMode: nextViewMode(l.viewMode) })
      if (!change) return
      take()
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
  // 本文を Markdown として解析するので、本文が変わったときだけ数え直す
  const activeContent = active?.content ?? ''
  const activeTodo = useMemo(() => todoStatus(activeContent), [activeContent])

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

  /** キーでノートを開く（本文の :note: リンク、ブラウザの戻る・進む）。今の一覧に無ければ、出る面に切り替える */
  function openNote(key: string) {
    const note = notes.find(n => n.key === key)
    if (!note) {
      setNotice('リンク先のノートが見つかりません。別のストレージにあるか、消されています')
      return
    }
    if (!visible.some(n => n.key === key)) {
      setSelection({ kind: 'smart', value: note.isTrashed ? 'trashed' : 'all' })
      setQuery('')
    }
    setActiveKey(key)
  }
  openNoteRef.current = openNote

  // 開いているノートを URL の # に書く。ノートを移るたびに履歴を足すので、ブラウザの戻る・進むで行き来できる。
  // 起動直後の選択とノートを閉じたときは履歴を足さずに書き換える
  useEffect(() => {
    const prev = shownKey.current
    shownKey.current = activeKey
    if (!hashReady.current) return
    const target = activeKey ? hashForNote(activeKey) : ''
    if (location.hash === target) return
    const url = target || location.pathname + location.search
    if (prev && activeKey) history.pushState(null, '', url)
    else history.replaceState(null, '', url)
  }, [activeKey])

  useEffect(() => {
    const onPop = () => {
      const key = noteKeyFromHash(location.hash)
      // ノートを指さない履歴（ノートを閉じたとき）に戻ったら、ノートも閉じて URL とそろえる
      if (key) openNoteRef.current(key)
      else setActiveKey(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  copyLinkRef.current = active
    ? () => {
        const text = noteLink(active)
        navigator.clipboard.writeText(text).then(
          () => setNotice(`コピーしました: ${text}`),
          () => setNotice('クリップボードに書き込めませんでした。見出しの「リンク」から選んでコピーしてください')
        )
        return true
      }
    : null

  /** 目次の見出し（行番号）へ、プレビューとエディタの両方を動かす */
  function jumpToLine(line: number) {
    previewRef.current?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ block: 'start' })
    const view = editorViewRef.current
    if (!view || line >= view.state.doc.lines) return
    const pos = view.state.doc.line(line + 1).from
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start' }) })
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

  async function handleExport(scope: ExportScope, format: ExportFormat) {
    // 1 件の Markdown は、これまでどおり保存先の書き出しを使う（デスクトップ版の中では OS の保存ダイアログ）
    const one = scope.kind === 'note' ? notes.find(n => n.key === scope.key) : undefined
    if (one && format === 'md' && repository.exportNote) return repository.exportNote(one)
    return runExport(scope, format, {
      notes,
      storages,
      breaks: config.preview.breaks,
      theme: themeVariables(config),
      printTheme: themeVariables({ ...config, ui: { ...config.ui, theme: 'white' } })
    })
  }

  // ダイアログの Esc を付け直さないよう、閉じる関数は作り直さない
  const closeExport = useMemo(() => () => setExportScope(null), [])

  /** 選んでいるフォルダ・タグがあればその範囲、無ければすべて */
  function selectionScope(): ExportScope {
    if (selection.kind === 'folder') {
      const [storage, folder] = selection.value.split('|')
      return { kind: 'folder', storage, folder }
    }
    if (selection.kind === 'tag') return { kind: 'tag', tag: selection.value }
    return { kind: 'all' }
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
          keys={{ prefs: displayCombo(config.hotkey.openPrefs), toggle: displayCombo(config.hotkey.toggleSidebar) }}
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
          onExport={scope => setExportScope(scope ?? selectionScope())}
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
        hotkey={config.hotkey}
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
              title={`サイドバーを出す (${displayCombo(config.hotkey.toggleSidebar)})`}
              aria-label="サイドバーを出す"
            >
              <ChevronsRight size={16} aria-hidden />
            </button>
          )}
          {layout.listMode === 'HIDDEN' && (
            <button
              className="pane-toggle"
              onClick={cycleList}
              title={`ノート一覧を出す (${displayCombo(config.hotkey.toggleNoteList)})`}
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
            <TodoStatus {...activeTodo} bar />
            <ModeSwitcher
              mode={layout.viewMode}
              onChange={viewMode => setLayout(l => ({ ...l, viewMode }))}
              hint={`${displayCombo(config.hotkey.togglePreview)} でプレビューと切り替え、${displayCombo(config.hotkey.cycleView)} で順に切り替え`}
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
                <button
                  className={`head-btn ${config.preview.showToc ? 'active' : ''}`}
                  onClick={() => setConfig(toggleToc)}
                  title={`目次（${displayCombo(config.hotkey.toggleToc)}）`}
                  aria-pressed={config.preview.showToc}
                >
                  <ListTree className="icon" size={13} aria-hidden /> 目次
                </button>
                <button
                  className={`head-btn ${linkOpen ? 'active' : ''}`}
                  onClick={() => setLinkOpen(o => !o)}
                  title="このノートへのリンクと URL"
                  aria-expanded={linkOpen}
                >
                  <Link2 className="icon" size={13} aria-hidden /> リンク
                </button>
                <button
                  className="head-btn"
                  onClick={() => setExportScope({ kind: 'note', key: active.key })}
                  title="エクスポート（txt・md・html・pdf）"
                >
                  <Download className="icon" size={13} aria-hidden /> エクスポート
                </button>
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
          {linkOpen && <NoteLinkPanel note={active} />}
          {!active.isTrashed && (
            <TagEditor
              key={active.key}
              tags={active.tags}
              onChange={updateTags}
            />
          )}
          <div
            className={`split view-${layout.viewMode.toLowerCase()} ${config.preview.showToc ? 'has-toc' : ''}`}
            ref={splitRef}
          >
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
                onView={v => {
                  editorViewRef.current = v
                  noteFind.onView(v)
                }}
                settings={{ ...config.editor, dark: isDark }}
                keys={config.hotkey}
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
            <Preview
              content={active.content}
              rootRef={previewRef}
              breaks={config.preview.breaks}
              onOpenNote={openNote}
              onToggleTask={
                active.isTrashed
                  ? undefined
                  : line => updateActiveContent(toggleTaskLine(active.content, line))
              }
            />
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
            {config.preview.showToc && (
              <TocPane
                content={active.content}
                minLevel={config.preview.tocMinLevel}
                maxLevel={config.preview.tocMaxLevel}
                onJump={jumpToLine}
                onClose={() => setConfig(c => ({ ...c, preview: { ...c.preview, showToc: false } }))}
                closeHint={displayCombo(config.hotkey.toggleToc)}
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
      {notice && (
        <div className="app-notice" role="status">
          {notice}
        </div>
      )}
      <ShortcutHelp open={showHelp} onClose={() => setShowHelp(false)} hotkey={config.hotkey} />
      {exportScope && (
        <ExportDialog
          initial={exportScope}
          notes={notes}
          storages={storages}
          active={active}
          folder={(() => {
            const scope = selectionScope()
            return scope.kind === 'folder' ? { storage: scope.storage, folder: scope.folder } : null
          })()}
          tag={selection.kind === 'tag' ? selection.value : null}
          onExport={handleExport}
          onClose={closeExport}
        />
      )}
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
            {canArchive && (
              <p className="prefs-note">
                iPhone・iPad では、Safari の共有メニューから「ホーム画面に追加」して使ってください。Safari のタブのままだと、しばらく開かない間にサイトのデータごとノートが消されることがあります。ホーム画面のアプリと Safari のタブは保存場所が別なので、移すときは zip で書き出して取り込みます。
              </p>
            )}
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
            {canSwitchStorage && !switchNotice && (
              <p className="prefs-note">
                {storageMode === 'folder'
                  ? '切り替えると、ブラウザの中のノートをその場で読み込みます。フォルダのノートは消えません。'
                  : '切り替えると、フォルダを選んでから、そのノートをその場で読み込みます。ブラウザの中のノートは消えません。'}
              </p>
            )}
            {switchNotice && (
              <p className="prefs-status" role="status">
                {switchNotice}
              </p>
            )}
          </>
        }
      />
    </div>
  )
}

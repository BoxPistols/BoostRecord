import { ArrowDown, ArrowUp, ChevronsLeft, Code, FileText, Plus } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Note } from '../types'
import { sortNotes, SORT_LABELS } from '../data/sort'
import type { SortKey, SortDir } from '../data/sort'
import { todoStatus } from '../markdown/taskList'
import { TodoStatus } from './TodoStatus'
import { displayCombo, isJumpModifierKey, jumpIndex, matches, recording } from '../hotkeys'
import type { Bindings, JumpModifier } from '../hotkeys'

const SORT_STORE = 'boostrecord_sort'

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
  width: number
  /** 畳んだ表示。並び替えを隠し、検索と一覧だけにする */
  folded?: boolean
  /** 隠す。検索文字列とスクロール位置を失わないよう、外さずに display:none にする */
  hidden?: boolean
  /** 左下の開閉ボタン（Cmd/Ctrl+Shift+B と同じ巡回） */
  onToggle: () => void
  /** 設定の「ホットキー」 */
  hotkey: Bindings & { jumpModifier: JumpModifier }
}

// 修飾キーをこの時間押し続けたら番号を出す。⌃L などを押すたびに番号がちらつかないように
const HOLD_MS = 300

const ROW_H = 58 // fixed row height enables simple, fast windowing
const OVERSCAN = 6

function shortDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

const badgeOf = (n: number) => (n >= 0 && n < 9 ? String(n + 1) : n === 9 ? '0' : undefined)

const NoteRow = memo(function NoteRow({
  note,
  active,
  top,
  onSelect,
  badge
}: {
  note: Note
  active: boolean
  top: number
  onSelect: (key: string) => void
  /** 修飾キーを押し続けている間に出す番号（押すとこのノートへ飛ぶ） */
  badge?: string
}) {
  const status = useMemo(() => todoStatus(note.content), [note.content])
  return (
    <div
      className={`note-row ${active ? 'active' : ''}`}
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: ROW_H
      }}
      onClick={() => onSelect(note.key)}
    >
      {badge !== undefined && (
        <span className="jump-badge" aria-hidden>
          {badge}
        </span>
      )}
      <div className="note-title">
        {note.type === 'SNIPPET_NOTE' ? (
          <Code className="ic" size={14} role="img" aria-label="スニペット" />
        ) : (
          <FileText className="ic" size={14} role="img" aria-label="Markdown ノート" />
        )}
        {note.title || '無題'}
      </div>
      <div className="note-meta">
        {shortDate(note.updatedAt)}
        {note.tags.length > 0 && ` · ${note.tags.map(t => `#${t}`).join(' ')}`}
        <TodoStatus {...status} />
      </div>
    </div>
  )
})

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
  onNewNote,
  width,
  folded = false,
  hidden = false,
  onToggle,
  hotkey
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

  // キー入力の処理は付け直さず、いつも今の値を見る
  const latest = useRef({ hotkey, sorted, activeKey, onSelect, hidden, scrollTop })
  latest.current = { hotkey, sorted, activeKey, onSelect, hidden, scrollTop }
  const [showBadges, setShowBadges] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const hide = () => {
      if (timer) clearTimeout(timer)
      timer = null
      setShowBadges(false)
    }
    // 選んだノートが見える位置まで一覧を動かす
    const reveal = (index: number) => {
      const el = scrollRef.current
      if (!el) return
      const top = index * ROW_H
      if (top < el.scrollTop) el.scrollTop = top
      else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight
    }
    const onKey = (e: KeyboardEvent) => {
      if (recording.active) return
      const { hotkey: k, sorted: list, activeKey: current, onSelect: select, hidden: off, scrollTop: st } = latest.current
      if (isJumpModifierKey(e, k.jumpModifier)) {
        if (!e.repeat && !timer) timer = setTimeout(() => setShowBadges(true), HOLD_MS)
        return
      }
      hide()
      // 番号は上から見えている順。1〜9 が 1〜9 番目、0 が 10 番目
      const n = off ? null : jumpIndex(e, k.jumpModifier)
      if (n !== null) {
        const index = Math.ceil(st / ROW_H) + n
        if (list[index]) {
          e.preventDefault()
          e.stopPropagation()
          select(list[index].key)
        }
        return
      }
      const step = matches(e, k.nextNote) ? 1 : matches(e, k.prevNote) ? -1 : 0
      if (step !== 0) {
        e.preventDefault()
        e.stopPropagation()
        if (list.length === 0) return
        const at = list.findIndex(x => x.key === current)
        const index = at < 0 ? 0 : Math.min(list.length - 1, Math.max(0, at + step))
        select(list[index].key)
        reveal(index)
        return
      }
    }
    // 一覧の検索へ移る（エディタで打っているときは除く）。ノート内検索のキーも、ノートを
    // 開いていないときはここへ来る。App が capture で取ったキーは届かないよう、bubble で聞く
    const onSearchKey = (e: KeyboardEvent) => {
      if (recording.active) return
      const k = latest.current.hotkey
      const inEditor = !!(e.target as Element | null)?.closest?.('.cm-editor')
      if ((matches(e, k.focusListSearch) && !inEditor) || matches(e, k.findInNote)) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (isJumpModifierKey(e, latest.current.hotkey.jumpModifier)) hide()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keydown', onSearchKey)
    window.addEventListener('keyup', onUp, true)
    // 押したまま別のウィンドウへ移ると keyup が来ない
    window.addEventListener('blur', hide)
    document.addEventListener('visibilitychange', hide)
    return () => {
      hide()
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keydown', onSearchKey)
      window.removeEventListener('keyup', onUp, true)
      window.removeEventListener('blur', hide)
      document.removeEventListener('visibilitychange', hide)
    }
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
  const firstVisible = Math.ceil(scrollTop / ROW_H)

  return (
    <section
      className={`notelist ${folded ? 'folded' : ''}`}
      style={hidden ? { display: 'none' } : { width }}
    >
      <div className="notelist-search">
        <input
          ref={searchRef}
          className="search-input"
          type="search"
          placeholder={`検索…  (${displayCombo(hotkey.focusListSearch)})`}
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
      </div>
      <div className="notelist-head">
        {!folded && (
          <>
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
              {sort.dir === 'asc' ? (
                <ArrowUp size={13} aria-hidden />
              ) : (
                <ArrowDown size={13} aria-hidden />
              )}
            </button>
          </>
        )}
        <span className="sort" style={{ marginLeft: 'auto' }}>
          {folded ? total : `${total} 件`}
        </span>
        {onNewNote && (
          <button
            className="head-btn"
            onClick={onNewNote}
            title={`新規ノート (${displayCombo(hotkey.newNote)})`}
            aria-label="新規ノート"
          >
            <Plus size={14} aria-hidden />
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
              <NoteRow
                key={note.key}
                note={note}
                active={note.key === activeKey}
                top={i * ROW_H}
                onSelect={onSelect}
                badge={showBadges ? badgeOf(i - firstVisible) : undefined}
              />
            )
          })}
          {total === 0 && (
            <div style={{ padding: 20, color: 'var(--faint)' }}>
              {query.trim() ? '一致するノートがありません' : 'No notes'}
            </div>
          )}
        </div>
      </div>
      <button
        className="pane-toggle"
        onClick={onToggle}
        title={`ノート一覧を${folded ? '隠す' : '畳む'} (${displayCombo(hotkey.toggleNoteList)})`}
        aria-label="ノート一覧の表示を切り替える"
      >
        <ChevronsLeft size={16} aria-hidden />
      </button>
    </section>
  )
}

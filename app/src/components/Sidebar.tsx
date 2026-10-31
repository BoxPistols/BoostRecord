import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  FolderPlus,
  Pencil,
  ChevronsLeft,
  Download,
  FileDown,
  Keyboard,
  Notebook,
  Plus,
  Settings,
  Star,
  Trash2,
  Upload
} from 'lucide-react'
import type { Note, Selection, Storage } from '../types'
import type { ExportScope } from '../data/exportPlan'

interface Props {
  /** キーの案内（設定の「ホットキー」で変わる） */
  keys: { prefs: string; toggle: string }
  storages: Storage[]
  notes: Note[]
  selection: Selection
  onSelect: (s: Selection) => void
  /** When set (Electron), shows a button to add a real storage folder. */
  onPickStorage?: () => void
  /** When set (Electron), shows a button to permanently empty the trash. */
  onEmptyTrash?: () => void
  /** Opens the keyboard-shortcut help overlay. */
  onShowHelp?: () => void
  /** 設定を開く（デスクトップ版のサイドバー下の設定ボタンと同じ） */
  onShowPreferences?: () => void
  /** ブラウザの中に保存しているとき（OPFS）、zip を取り込む */
  onImportArchive?: () => void
  /** ブラウザの中に保存しているとき（OPFS）、zip で書き出す */
  onExportArchive?: () => void
  /** エクスポートのダイアログを開く。範囲を渡さなければ、選んでいるフォルダ・タグ（無ければすべて） */
  onExport?: (scope?: ExportScope) => void
  /** フォルダを作る。失敗したら理由を返す（入力欄に出す） */
  onCreateFolder?: (storage: string, name: string) => Promise<string | null>
  /** フォルダの名前を変える。失敗したら理由を返す */
  onRenameFolder?: (storage: string, folder: string, name: string) => Promise<string | null>
  /** 畳んだ表示（アイコンだけ）。名前は title で出す */
  folded?: boolean
  width: number
  /** 左下の開閉ボタン（Cmd/Ctrl+B と同じ巡回） */
  onToggle: () => void
}

export function Sidebar({
  storages,
  notes,
  selection,
  onSelect,
  onPickStorage,
  onEmptyTrash,
  onShowHelp,
  onShowPreferences,
  onImportArchive,
  onExportArchive,
  onExport,
  onCreateFolder,
  onRenameFolder,
  folded = false,
  width,
  onToggle,
  keys
}: Props) {
  const live = notes.filter(n => !n.isTrashed)
  const counts = {
    all: live.length,
    starred: live.filter(n => n.isStarred).length,
    trashed: notes.filter(n => n.isTrashed).length
  }
  const folderCount = (storage: string, folder: string) =>
    live.filter(n => n.storage === storage && n.folder === folder).length

  const tags = Array.from(new Set(live.flatMap(n => n.tags))).sort()

  const isSmart = (v: string) => selection.kind === 'smart' && selection.value === v
  const isFolder = (key: string) =>
    selection.kind === 'folder' && selection.value === key
  const isTag = (t: string) => selection.kind === 'tag' && selection.value === t

  // 名前を入れている欄。folder が無ければ新しいフォルダ
  const [editing, setEditing] = useState<{ storage: string; folder?: string } | null>(null)
  // フォルダの右クリックのメニュー
  const [menu, setMenu] = useState<{ x: number; y: number; storage: string; folder: string } | null>(null)
  const isEditing = (storage: string, folder?: string) =>
    editing?.storage === storage && editing.folder === folder

  return (
    <nav
      className={`sidebar ${folded ? 'folded' : ''}`}
      style={{ width }}
    >
      <div className="side-section">
        {(
          [
            ['all', Notebook, 'すべてのノート', counts.all],
            ['starred', Star, 'スター付き', counts.starred],
            ['trashed', Trash2, 'ゴミ箱', counts.trashed]
          ] as const
        ).map(([value, Icon, label, count]) => (
          <div
            key={value}
            className={`side-item ${isSmart(value) ? 'active' : ''}`}
            onClick={() => onSelect({ kind: 'smart', value })}
            title={`${label} (${count})`}
          >
            <Icon className="icon" size={16} aria-hidden />
            {!folded && (
              <>
                <span className="side-label">{label}</span>
                <span className="count">{count}</span>
              </>
            )}
          </div>
        ))}
        {!folded && onEmptyTrash && counts.trashed > 0 && (
          <button className="empty-trash" onClick={onEmptyTrash} title="ゴミ箱を空にする">
            ゴミ箱を空にする
          </button>
        )}
      </div>

      {storages.map(storage => (
        <div className="side-section" key={storage.key}>
          {!folded && (
            <div className="side-storage" title={storage.name}>
              <ChevronDown className="icon" size={14} aria-hidden />
              <span className="side-label">{storage.name}</span>
              {onCreateFolder && (
                <button
                  className="side-storage-add"
                  onClick={() => setEditing({ storage: storage.key })}
                  title="フォルダを作る"
                  aria-label={`${storage.name} にフォルダを作る`}
                >
                  <FolderPlus size={14} aria-hidden />
                </button>
              )}
            </div>
          )}
          {storage.folders.map(folder => {
            const key = `${storage.key}|${folder.key}`
            if (!folded && onRenameFolder && isEditing(storage.key, folder.key)) {
              return (
                <FolderNameInput
                  key={folder.key}
                  color={folder.color}
                  initial={folder.name}
                  label={`「${folder.name}」の新しい名前`}
                  onSubmit={name => onRenameFolder(storage.key, folder.key, name)}
                  onDone={() => setEditing(null)}
                />
              )
            }
            return (
              <div
                key={folder.key}
                className={`side-item ${isFolder(key) ? 'active' : ''}`}
                onClick={() => onSelect({ kind: 'folder', value: key })}
                // デスクトップ版と同じく、右クリックで名前の変更と書き出しを選べる
                onContextMenu={
                  onExport || onRenameFolder
                    ? e => {
                        e.preventDefault()
                        setMenu({ x: e.clientX, y: e.clientY, storage: storage.key, folder: folder.key })
                      }
                    : undefined
                }
                title={`${storage.name} / ${folder.name} (${folderCount(storage.key, folder.key)})`}
              >
                <span className="dot" style={{ background: folder.color }} />
                {!folded && (
                  <>
                    <span className="side-label">{folder.name}</span>
                    <span className="count">
                      {folderCount(storage.key, folder.key)}
                    </span>
                  </>
                )}
              </div>
            )
          })}
          {!folded && onCreateFolder && isEditing(storage.key) && (
            <FolderNameInput
              initial=""
              label="新しいフォルダの名前"
              placeholder="フォルダ名（/ で区切ると子フォルダ）"
              onSubmit={name => onCreateFolder(storage.key, name)}
              onDone={() => setEditing(null)}
            />
          )}
        </div>
      ))}
      {menu && (
        <FolderMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {onRenameFolder && (
            <button role="menuitem" onClick={() => { setMenu(null); setEditing({ storage: menu.storage, folder: menu.folder }) }}>
              <Pencil className="icon" size={13} aria-hidden /> 名前を変える
            </button>
          )}
          {onExport && (
            <button role="menuitem" onClick={() => { setMenu(null); onExport({ kind: 'folder', storage: menu.storage, folder: menu.folder }) }}>
              <FileDown className="icon" size={13} aria-hidden /> エクスポート
            </button>
          )}
        </FolderMenu>
      )}

      {!folded && tags.length > 0 && (
        <div className="side-section">
          <div className="side-head">タグ</div>
          <div style={{ padding: '2px 8px' }}>
            {tags.map(tag => (
              <span
                key={tag}
                className={`tag-chip ${isTag(tag) ? 'active' : ''}`}
                onClick={() => onSelect({ kind: 'tag', value: tag })}
                onContextMenu={
                  onExport &&
                  (e => {
                    e.preventDefault()
                    onExport({ kind: 'tag', tag })
                  })
                }
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {!folded &&
        (onPickStorage || onShowHelp || onShowPreferences || onImportArchive || onExportArchive || onExport) && (
        <div className="side-section" style={{ marginTop: 'auto' }}>
          {onPickStorage && (
            <button className="btn-ghost" onClick={onPickStorage} title="ストレージを追加">
              <Plus className="icon" size={14} aria-hidden /> <span className="side-label">ストレージを追加</span>
            </button>
          )}
          {onExport && (
            <button
              className="btn-ghost"
              onClick={() => onExport()}
              title="ノートを txt・md・html・pdf で書き出します。フォルダやタグは右クリックでも書き出せます"
            >
              <FileDown className="icon" size={14} aria-hidden /> <span className="side-label">エクスポート</span>
            </button>
          )}
          {onExportArchive && (
            <button
              className="btn-ghost"
              onClick={onExportArchive}
              title="このブラウザに保存しているノートを zip にして保存します。展開するとデスクトップ版のストレージとして開けます"
            >
              <Download className="icon" size={14} aria-hidden /> <span className="side-label">zip で書き出す</span>
            </button>
          )}
          {onImportArchive && (
            <button
              className="btn-ghost"
              onClick={onImportArchive}
              title="ストレージフォルダを zip にしたものを取り込みます。このブラウザに今あるノートは置き換わります"
            >
              <Upload className="icon" size={14} aria-hidden /> <span className="side-label">zip を取り込む</span>
            </button>
          )}
          {onShowHelp && (
            <button className="btn-ghost" onClick={onShowHelp} title="ショートカット">
              <Keyboard className="icon" size={14} aria-hidden /> <span className="side-label">ショートカット</span>
            </button>
          )}
          {onShowPreferences && (
            <button className="btn-ghost" onClick={onShowPreferences} title={`設定 (${keys.prefs})`}>
              <Settings className="icon" size={14} aria-hidden /> <span className="side-label">設定</span>
            </button>
          )}
        </div>
      )}
      <button
        className="pane-toggle"
        onClick={onToggle}
        title={`サイドバーを${folded ? '隠す' : '畳む'} (${keys.toggle})`}
        aria-label="サイドバーの表示を切り替える"
      >
        <ChevronsLeft size={16} aria-hidden />
      </button>
    </nav>
  )
}

/**
 * フォルダ名を入れる欄。Enter で決め、Esc でやめる。欄から外れたときは、変えていれば決め、
 * 変えていなければやめる。決められなかったら理由を出して欄を残す
 */
function FolderNameInput({
  initial,
  label,
  placeholder,
  color,
  onSubmit,
  onDone
}: {
  initial: string
  label: string
  placeholder?: string
  color?: string
  onSubmit: (name: string) => Promise<string | null>
  onDone: () => void
}) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  async function submit() {
    if (busy.current) return
    if (value.trim() === initial.trim()) return onDone()
    busy.current = true
    const err = await onSubmit(value)
    busy.current = false
    if (err) {
      setError(err)
      input.current?.focus()
    } else onDone()
  }

  return (
    <div className="side-item folder-edit">
      <span className="dot" style={{ background: color ?? 'var(--muted)' }} />
      <div className="folder-edit-body">
        <input
          ref={input}
          value={value}
          aria-label={label}
          aria-invalid={!!error}
          placeholder={placeholder}
          onChange={e => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={e => {
            // 日本語の変換を決める Enter では決めない
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onDone()
            }
          }}
          onBlur={() => {
            if (!value.trim()) onDone()
            else if (!error) submit()
          }}
        />
        {error && <div className="folder-edit-error" role="alert">{error}</div>}
      </div>
    </div>
  )
}

/** 右クリックの位置に出すメニュー。外を押す・Esc・スクロールで閉じる */
function FolderMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [onClose])
  // 画面の端からはみ出さないように寄せる
  const left = Math.min(x, window.innerWidth - 180)
  const top = Math.min(y, window.innerHeight - 90)
  return (
    <div ref={ref} className="folder-menu" role="menu" style={{ left, top }}>
      {children}
    </div>
  )
}

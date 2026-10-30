import {
  ChevronDown,
  ChevronsLeft,
  Download,
  Keyboard,
  Notebook,
  Plus,
  Settings,
  Star,
  Trash2,
  Upload
} from 'lucide-react'
import type { Note, Selection, Storage } from '../types'

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
            </div>
          )}
          {storage.folders.map(folder => {
            const key = `${storage.key}|${folder.key}`
            return (
              <div
                key={folder.key}
                className={`side-item ${isFolder(key) ? 'active' : ''}`}
                onClick={() => onSelect({ kind: 'folder', value: key })}
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
        </div>
      ))}

      {!folded && tags.length > 0 && (
        <div className="side-section">
          <div className="side-head">タグ</div>
          <div style={{ padding: '2px 8px' }}>
            {tags.map(tag => (
              <span
                key={tag}
                className={`tag-chip ${isTag(tag) ? 'active' : ''}`}
                onClick={() => onSelect({ kind: 'tag', value: tag })}
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {!folded &&
        (onPickStorage || onShowHelp || onShowPreferences || onImportArchive || onExportArchive) && (
        <div className="side-section" style={{ marginTop: 'auto' }}>
          {onPickStorage && (
            <button className="btn-ghost" onClick={onPickStorage} title="ストレージを追加">
              <Plus className="icon" size={14} aria-hidden /> <span className="side-label">ストレージを追加</span>
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

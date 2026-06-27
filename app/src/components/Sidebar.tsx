import type { Note, Selection, Storage } from '../types'

interface Props {
  storages: Storage[]
  notes: Note[]
  selection: Selection
  onSelect: (s: Selection) => void
  /** When set (Electron), shows a button to add a real storage folder. */
  onPickStorage?: () => void
  /** When set (Electron), shows a button to permanently empty the trash. */
  onEmptyTrash?: () => void
}

export function Sidebar({
  storages,
  notes,
  selection,
  onSelect,
  onPickStorage,
  onEmptyTrash
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
    <nav className="sidebar">
      <div className="side-section">
        <div
          className={`side-item ${isSmart('all') ? 'active' : ''}`}
          onClick={() => onSelect({ kind: 'smart', value: 'all' })}
        >
          <span>📒</span> All Notes <span className="count">{counts.all}</span>
        </div>
        <div
          className={`side-item ${isSmart('starred') ? 'active' : ''}`}
          onClick={() => onSelect({ kind: 'smart', value: 'starred' })}
        >
          <span>★</span> Starred <span className="count">{counts.starred}</span>
        </div>
        <div
          className={`side-item ${isSmart('trashed') ? 'active' : ''}`}
          onClick={() => onSelect({ kind: 'smart', value: 'trashed' })}
        >
          <span>🗑</span> Trash <span className="count">{counts.trashed}</span>
        </div>
        {onEmptyTrash && counts.trashed > 0 && (
          <button className="empty-trash" onClick={onEmptyTrash}>
            ゴミ箱を空にする
          </button>
        )}
      </div>

      {storages.map(storage => (
        <div className="side-section" key={storage.key}>
          <div className="side-storage">▾ {storage.name}</div>
          {storage.folders.map(folder => {
            const key = `${storage.key}|${folder.key}`
            return (
              <div
                key={folder.key}
                className={`side-item ${isFolder(key) ? 'active' : ''}`}
                onClick={() => onSelect({ kind: 'folder', value: key })}
              >
                <span className="dot" style={{ background: folder.color }} />
                {folder.name}
                <span className="count">{folderCount(storage.key, folder.key)}</span>
              </div>
            )
          })}
        </div>
      ))}

      {tags.length > 0 && (
        <div className="side-section">
          <div className="side-head">Tags</div>
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

      {onPickStorage && (
        <div className="side-section" style={{ marginTop: 'auto' }}>
          <button className="btn-ghost" onClick={onPickStorage}>
            ＋ ストレージを追加
          </button>
        </div>
      )}
    </nav>
  )
}

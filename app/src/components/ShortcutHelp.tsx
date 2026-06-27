import { useEffect } from 'react'

/** Keyboard shortcuts shown in the in-app help overlay (mirrors the README). */
const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: '⌘/Ctrl + N', desc: '新規ノート' },
  { keys: '⌘/Ctrl + F', desc: '検索にフォーカス' },
  { keys: '⌘/Ctrl + B', desc: '太字（選択をトグル）' },
  { keys: '⌘/Ctrl + I', desc: '斜体（選択をトグル）' },
  { keys: '⌘/Ctrl + K', desc: 'リンク化' },
  { keys: 'Esc', desc: 'このヘルプを閉じる' }
]

interface Props {
  open: boolean
  onClose: () => void
}

/** Modal overlay listing keyboard shortcuts. Closes on Esc or backdrop click. */
export function ShortcutHelp({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="overlay-card"
        role="dialog"
        aria-label="キーボードショートカット"
        onClick={e => e.stopPropagation()}
      >
        <div className="overlay-title">キーボードショートカット</div>
        <table className="shortcut-table">
          <tbody>
            {SHORTCUTS.map(s => (
              <tr key={s.keys}>
                <td className="shortcut-keys">{s.keys}</td>
                <td>{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

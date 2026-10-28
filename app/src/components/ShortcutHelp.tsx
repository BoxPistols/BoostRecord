import { useEffect } from 'react'
import { SHORTCUTS } from '../shortcuts'


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

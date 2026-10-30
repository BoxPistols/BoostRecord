import { useEffect } from 'react'
import { HOTKEYS, displayCombo, jumpLabel } from '../hotkeys'
import type { Bindings, JumpModifier } from '../hotkeys'

interface Props {
  open: boolean
  onClose: () => void
  hotkey: Bindings & { jumpModifier: JumpModifier }
}

/** Modal overlay listing keyboard shortcuts. Closes on Esc or backdrop click. */
export function ShortcutHelp({ open, onClose, hotkey }: Props) {
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
            {HOTKEYS.map(h => (
              <tr key={h.id}>
                <td className="shortcut-keys">{displayCombo(hotkey[h.id])}</td>
                <td>{h.desc}</td>
              </tr>
            ))}
            <tr>
              <td className="shortcut-keys">{jumpLabel(hotkey.jumpModifier)}</td>
              <td>一覧の上から N 番目のノートへ（押し続けると番号が出る。0 は 10 番目）</td>
            </tr>
            <tr>
              <td className="shortcut-keys">Esc</td>
              <td>開いている画面を閉じる</td>
            </tr>
          </tbody>
        </table>
        <p className="prefs-note">キーは設定の「ホットキー」で変えられます。</p>
      </div>
    </div>
  )
}

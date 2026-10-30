import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { Note } from '../types'
import { hashForNote, noteLink } from '../noteUrl'

/**
 * このノートを指す 2 つの書き方を、中身を見せたうえでコピーできるようにする。
 * Markdown のリンクはデスクトップ版の「Copy Note Link」と同じで、ほかのノートに貼ると
 * そのノートへ飛べる。URL はブラウザで開くとこのノートが開く
 */
export function NoteLinkPanel({ note }: { note: Note }) {
  const rows = [
    { id: 'md', label: 'Markdown のリンク', value: noteLink(note) },
    { id: 'url', label: 'URL', value: `${location.origin}${location.pathname}${hashForNote(note.key)}` }
  ]
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setError(null)
      setCopied(id)
    } catch {
      setError('クリップボードに書き込めませんでした。欄を選んでコピーしてください')
    }
  }

  return (
    <div className="note-link-panel">
      {rows.map(r => (
        <label key={r.id} className="note-link-row">
          <span className="note-link-label">{r.label}</span>
          <input readOnly value={r.value} onFocus={e => e.currentTarget.select()} />
          <button type="button" className="btn-ghost-inline" onClick={() => copy(r.id, r.value)}>
            {copied === r.id ? <Check className="icon" size={13} aria-hidden /> : <Copy className="icon" size={13} aria-hidden />}
            {copied === r.id ? 'コピーしました' : 'コピー'}
          </button>
        </label>
      ))}
      {error && <div className="note-link-error">{error}</div>}
    </div>
  )
}

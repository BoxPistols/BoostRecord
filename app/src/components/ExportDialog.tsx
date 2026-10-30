import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import type { Note, Storage } from '../types'
import { notesInScope, planExport, zipName } from '../data/exportPlan'
import type { ExportFormat, ExportScope } from '../data/exportPlan'

interface Props {
  /** 開いたときに選んでおく範囲（開くたびに作り直すので、最初の値だけを使う） */
  initial: ExportScope
  notes: Note[]
  storages: Storage[]
  /** 開いているノート（「このノート」に出す） */
  active: Note | null
  /** 選んでいるフォルダ・タグ（その範囲を出す） */
  folder: { storage: string; folder: string } | null
  tag: string | null
  onExport: (scope: ExportScope, format: ExportFormat) => Promise<boolean>
  onClose: () => void
}

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'txt', label: 'テキスト (.txt)' },
  { value: 'md', label: 'Markdown (.md)' },
  { value: 'html', label: 'HTML (.html)' },
  { value: 'pdf', label: 'PDF（印刷の画面から保存）' }
]

const sameScope = (a: ExportScope, b: ExportScope) => JSON.stringify(a) === JSON.stringify(b)

/**
 * デスクトップ版の「Export as」と同じ範囲（ノート・フォルダ・タグ・すべて）と形式。
 * 何が書き出されるかを、押す前にファイル名の一覧で見せる
 */
export function ExportDialog({ initial, notes, storages, active, folder, tag, onExport, onClose }: Props) {
  const [scope, setScope] = useState<ExportScope>(initial)
  const [format, setFormat] = useState<ExportFormat>('md')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 右クリックしたフォルダ・タグは、選んでいなくても範囲に出す
  const folderOpt = initial.kind === 'folder' ? { storage: initial.storage, folder: initial.folder } : folder
  const tagOpt = initial.kind === 'tag' ? initial.tag : tag
  const scopes: { scope: ExportScope; label: string }[] = []
  if (active && active.type === 'MARKDOWN_NOTE' && !active.isTrashed) {
    scopes.push({ scope: { kind: 'note', key: active.key }, label: `このノート「${active.title || '無題'}」` })
  }
  if (folderOpt) {
    const name = storages.find(s => s.key === folderOpt.storage)?.folders.find(f => f.key === folderOpt.folder)?.name
    scopes.push({ scope: { kind: 'folder', ...folderOpt }, label: `フォルダ「${name ?? folderOpt.folder}」` })
  }
  if (tagOpt) scopes.push({ scope: { kind: 'tag', tag: tagOpt }, label: `タグ「#${tagOpt}」` })
  scopes.push({ scope: { kind: 'all' }, label: 'すべてのノート' })

  const count = notesInScope(notes, scope).length
  const files = format === 'pdf' ? [] : planExport(notes, storages, scope, format).map(i => i.path)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      // 印刷の間はアプリごと隠れるので、PDF でもダイアログは写らない。失敗はここに出す
      if (await onExport(scope, format)) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card export-dialog" role="dialog" aria-label="エクスポート" onClick={e => e.stopPropagation()}>
        <div className="overlay-title">エクスポート</div>
        <fieldset>
          <legend>範囲</legend>
          {scopes.map(s => (
            <label key={JSON.stringify(s.scope)}>
              <input type="radio" name="export-scope" checked={sameScope(scope, s.scope)} onChange={() => setScope(s.scope)} />
              {s.label}
              <span className="count">{notesInScope(notes, s.scope).length} 件</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>形式</legend>
          {FORMATS.map(f => (
            <label key={f.value}>
              <input type="radio" name="export-format" checked={format === f.value} onChange={() => setFormat(f.value)} />
              {f.label}
            </label>
          ))}
        </fieldset>
        <div className="export-out">
          {count === 0 ? (
            <p>この範囲に書き出せるノートがありません（ゴミ箱とスニペットは含めません）。</p>
          ) : format === 'pdf' ? (
            <p>
              印刷の画面が開きます。送り先で「PDF に保存」を選んでください。
              {count > 1 && ` ${count} 件を 1 つの PDF にまとめ、ノートごとに改ページします。`}
            </p>
          ) : files.length === 1 ? (
            <p>
              書き出すファイル: <code>{files[0]}</code>
            </p>
          ) : (
            <>
              <p>
                <code>{zipName(scope, storages, format)}</code> に {files.length} 件をまとめます。
              </p>
              <ul className="export-files">
                {files.map(f => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
          {error && <p className="export-error">{error}</p>}
        </div>
        <div className="export-actions">
          <button className="btn-ghost-inline" onClick={onClose}>
            閉じる
          </button>
          <button className="btn-primary" onClick={run} disabled={busy || count === 0}>
            <Download className="icon" size={14} aria-hidden /> 書き出す
          </button>
        </div>
      </div>
    </div>
  )
}

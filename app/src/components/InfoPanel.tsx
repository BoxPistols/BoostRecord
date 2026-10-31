import { useMemo } from 'react'
import type { Note } from '../types'
import { countLetters, countWords, formatDateTime } from '../noteStats'

interface Props {
  note: Note
  storageName: string
  folderName: string
}

/**
 * ノートの情報。デスクトップ版の InfoPanel と同じ項目（更新日時・作成日時・ストレージ・フォルダ・
 * 単語数・文字数）。リンクとエクスポートは見出しにそれぞれのボタンがあるので、ここには置かない
 */
export function InfoPanel({ note, storageName, folderName }: Props) {
  // スニペットは数えない（デスクトップ版と同じ）
  const counts = useMemo(
    () => (note.type === 'SNIPPET_NOTE' ? null : { words: countWords(note.content), letters: countLetters(note.content) }),
    [note.type, note.content]
  )
  const rows: [string, string][] = [
    ['更新日時', formatDateTime(note.updatedAt)],
    ['作成日時', formatDateTime(note.createdAt)],
    ['ストレージ', storageName],
    ['フォルダ', folderName]
  ]
  if (counts) {
    rows.push(['単語数', counts.words.toLocaleString()], ['文字数（改行を除く）', counts.letters.toLocaleString()])
  }
  return (
    <dl className="info-panel" aria-label="ノートの情報">
      {rows.map(([label, value]) => (
        <div key={label} className="info-row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

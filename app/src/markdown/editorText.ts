// デスクトップ版のエディタのホットキー（browser/components/CodeEditor.js）の中身。
// CodeMirror に依存しない部分だけを置き、テストから直接呼べるようにする

const pad = (n: number) => String(n).padStart(2, '0')

/** ⌘/Ctrl + / で入れる日付。ISO 8601 はその土地の日付（UTC にすると朝 9 時まで前日になる） */
export function formatDate(now: Date, iso: boolean): string {
  if (!iso) return now.toLocaleDateString()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 日付と時刻。ISO 8601 は時差つき（例 2026-10-29T09:05:03+09:00） */
export function formatDateTime(now: Date, iso: boolean): string {
  if (!iso) return now.toLocaleString()
  const off = -now.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return (
    `${formatDate(now, true)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

/** 行を並べ替える。末尾の改行は残す（デスクトップ版と同じ） */
export function sortLinesText(text: string): string {
  const trailing = /\n$/.test(text)
  return text.trim().split('\n').sort().join('\n') + (trailing ? '\n' : '')
}

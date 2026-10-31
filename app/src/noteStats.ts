// 情報パネルの数字。デスクトップ版（MarkdownNoteDetail の wordCount / letterCount）を元にする。
// デスクトップ版は空白で区切って単語を数えるので、日本語の文は 1 語になる。ブラウザでは
// Intl.Segmenter で語に分け、日本語でも語の数を出す（無い環境では空白区切りに戻す）

const segmenter = (granularity: 'word' | 'grapheme') =>
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ja', { granularity }) : null

const words = segmenter('word')
const graphemes = segmenter('grapheme')

/** 改行を除いた文字数。絵文字や結合文字は見えている 1 文字を 1 と数える */
export function countLetters(content: string): number {
  const text = content.replace(/\r?\n/g, '')
  if (!graphemes) return [...text].length
  let n = 0
  for (const _ of graphemes.segment(text)) n++
  return n
}

/** 単語の数。記号と空白は数えない。空のノートは 0 */
export function countWords(content: string): number {
  if (!words) return content.trim() ? content.trim().split(/\s+/).length : 0
  let n = 0
  for (const s of words.segment(content)) if (s.isWordLike) n++
  return n
}

/** 2026/10/31 9:05 の形。保存値が壊れていたら、そのまま出す */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`
}

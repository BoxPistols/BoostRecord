// 目次に出す見出しを本文から拾う。デスクトップ版の browser/lib/markdownHeadings.js と同じ規則。
//
// ジャンプは見出しの id ではなく行番号で行う。id は作り方が少しずれると静かに一致しなくなり、
// 押しても何も起きない形で壊れる。プレビューの見出しには data-line（元の行番号）を付けてある

export const MIN_LEVEL = 1
export const MAX_LEVEL = 6

export interface Heading {
  level: number
  text: string
  /** 0 始まり */
  line: number
}

// ATX 見出し。閉じの # は出さない
const ATX = /^(#{1,6})\s+(.*?)\s*#*\s*$/
// ``` または ~~~ のフェンス。同じ記号・同じ長さ以上で閉じる
const FENCE = /^([ \t]*)(`{3,}|~{3,})(.*)$/

function clampLevel(value: unknown, fallback: number) {
  const n = parseInt(String(value), 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, n))
}

/** 設定値を範囲内へ丸める。min > max は入れ替える（片方だけ動かした瞬間に目次が空にならない） */
export function normalizeLevelRange(min: unknown, max: unknown): { min: number; max: number } {
  const lo = clampLevel(min, MIN_LEVEL)
  const hi = clampLevel(max, 3)
  return lo <= hi ? { min: lo, max: hi } : { min: hi, max: lo }
}

export function extractHeadings(content: string, options: { minLevel?: number; maxLevel?: number } = {}): Heading[] {
  if (!content) return []
  const { min, max } = normalizeLevelRange(options.minLevel, options.maxLevel)
  const lines = content.split('\n')
  const out: Heading[] = []
  let fence: { marker: string; length: number } | null = null
  // 先頭の front matter（--- で囲んだ部分）はプレビューに出ないので、その中の # も拾わない
  let start = 0
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) start = end + 1
  }
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]
    const fenceMatch = FENCE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[2][0]
      const length = fenceMatch[2].length
      // 情報文字列（```js など）が付くのは開くほうだけ
      if (!fence) fence = { marker, length }
      else if (marker === fence.marker && length >= fence.length) fence = null
      continue
    }
    // フェンスの中の # は見出しではない（コード例でよく出る）
    if (fence) continue
    // 4 文字以上の字下げはコードブロック
    if (/^( {4,}|\t)/.test(line)) continue
    const m = ATX.exec(line)
    if (!m) continue
    const level = m[1].length
    if (level < min || level > max) continue
    const text = m[2].trim()
    if (text) out.push({ level, text, line: index })
  }
  return out
}

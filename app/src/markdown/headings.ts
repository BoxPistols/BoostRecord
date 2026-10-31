import type Token from 'markdown-it/lib/token.mjs'

// 目次に出す見出しを拾う。デスクトップ版（browser/lib/markdownHeadings.js）と同じく行番号で飛ぶ。
// 見出しの id は作り方が少しずれると静かに一致しなくなり、押しても何も起きない形で壊れる。
//
// 本文を自前の正規表現で読むと、プレビューと「どこが見出しか」が食い違う（字下げ・引用の中・
// 下線の見出し・改行コード・フェンスの閉じ方など）。プレビューと同じ markdown-it の解析結果から
// 拾い、プレビューの見出しに付けた data-line と同じ行番号を使う

export const MIN_LEVEL = 1
export const MAX_LEVEL = 6

export interface Heading {
  level: number
  text: string
  /** 0 始まり */
  line: number
}

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

/** 見出しに見えている文字。絵文字（:smile:）も見出しに出るので含める */
export function headingText(inline: Token | undefined): string {
  return (inline?.children ?? [])
    .filter(t => t.type === 'text' || t.type === 'code_inline' || t.type === 'emoji')
    .map(t => t.content)
    .join('')
    .trim()
}

/** md.parse() の結果から、設定のレベルの見出しを拾う */
export function extractHeadings(tokens: Token[], options: { minLevel?: number; maxLevel?: number } = {}): Heading[] {
  const { min, max } = normalizeLevelRange(options.minLevel, options.maxLevel)
  const out: Heading[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type !== 'heading_open' || !t.map) continue
    const level = Number(t.tag.slice(1))
    if (level < min || level > max) continue
    const text = headingText(tokens[i + 1])
    if (text) out.push({ level, text, line: t.map[0] })
  }
  return out
}

// 本文から見出しを拾って目次（ページ内リンク）を作る。
//
// プレビューは iframe で、要素には data-line が振られている。行番号で
// ジャンプできるので slug は使わない（slug は生成規則がずれると静かに
// 一致しなくなり、クリックしても何も起きない形で壊れる）。
//
// CodeMirror も markdown-it も持ち込まない純粋関数。境界条件
// （コードフェンス内の # / インデントされたコード / 設定レベル外）を
// テストで固めたいため。

export const MIN_LEVEL = 1
export const MAX_LEVEL = 6

// ATX 見出し。閉じの # は表示しない
const ATX = /^(#{1,6})\s+(.*?)\s*#*\s*$/
// ``` または ~~~ のフェンス。同じ記号・同じ長さ以上で閉じる
const FENCE = /^([ \t]*)(`{3,}|~{3,})(.*)$/

function clampLevel(value, fallback) {
  const n = parseInt(value, 10)
  if (isNaN(n)) return fallback
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, n))
}

/**
 * 設定値を安全な範囲へ丸める。min > max の指定は入れ替える
 * （設定画面で片方だけ動かした瞬間に目次が空になるのを防ぐ）。
 *
 * @param {*} min
 * @param {*} max
 * @returns {{min: number, max: number}}
 */
export function normalizeLevelRange(min, max) {
  const lo = clampLevel(min, MIN_LEVEL)
  const hi = clampLevel(max, 3)
  return lo <= hi ? { min: lo, max: hi } : { min: hi, max: lo }
}

/**
 * 見出しを抽出する。
 *
 * @param {string} content ノート本文
 * @param {{minLevel?: number, maxLevel?: number}} [options]
 * @returns {Array<{level: number, text: string, line: number}>} line は 0 起点
 */
export function extractHeadings(content, options) {
  if (typeof content !== 'string' || content === '') return []
  const opts = options || {}
  const { min, max } = normalizeLevelRange(opts.minLevel, opts.maxLevel)

  const out = []
  let fence = null // { marker: '```' | '~~~', length: number }

  content.split('\n').forEach((line, index) => {
    const fenceMatch = line.match(FENCE)
    if (fenceMatch) {
      const marker = fenceMatch[2].charAt(0)
      const length = fenceMatch[2].length
      if (!fence) {
        // 情報文字列（```js 等）が付くのは開始側だけ
        fence = { marker, length }
        return
      }
      // 同じ記号で、開始と同じ長さ以上なら閉じる
      if (marker === fence.marker && length >= fence.length) fence = null
      return
    }
    // フェンスの中の # は見出しではない（コード例で頻出する）
    if (fence) return
    // 4 スペース以上のインデントはコードブロック
    if (/^( {4,}|\t)/.test(line)) return

    const m = line.match(ATX)
    if (!m) return
    const level = m[1].length
    if (level < min || level > max) return
    const text = m[2].trim()
    if (text === '') return
    out.push({ level, text, line: index })
  })

  return out
}

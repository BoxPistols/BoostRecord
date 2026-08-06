// ノート内検索の「探す」部分。DOM も CodeMirror も持ち込まない純粋関数。
//
// エディタ（CodeMirror のドキュメント）とプレビュー（iframe の DOM テキスト）
// で当たり判定を共通にするため、どちらも「1本の文字列に対する一致位置の配列」
// に落としてから扱う。境界条件（大文字小文字、空クエリ、重なり、全角）を
// テストで固めたい。

/**
 * text の中から query に一致する位置をすべて返す。
 *
 * 重なる一致は数えない（`aa` を `aaa` から探すと 1 件）。数えると
 * 「次へ」で同じ場所に留まって見えるため。
 *
 * @param {string} text
 * @param {string} query
 * @param {{caseSensitive?: boolean}} [options]
 * @returns {Array<{start: number, end: number}>}
 */
export function findMatches(text, query, options) {
  const opts = options || {}
  if (typeof text !== 'string' || typeof query !== 'string') return []
  if (query === '') return []

  const haystack = opts.caseSensitive ? text : text.toLowerCase()
  const needle = opts.caseSensitive ? query : query.toLowerCase()
  // 大文字小文字を畳むと長さが変わる文字（ẞ 等）があると、位置が
  // 元テキストとずれる。長さが変わる場合は畳まない方に倒す
  if (haystack.length !== text.length || needle.length !== query.length) {
    return findMatches(text, query, { caseSensitive: true })
  }

  const out = []
  let from = 0
  for (;;) {
    const index = haystack.indexOf(needle, from)
    if (index === -1) break
    out.push({ start: index, end: index + needle.length })
    from = index + needle.length
  }
  return out
}

/**
 * 「次へ / 前へ」でどの一致に移るか。端は反対側へ回り込む
 * （一周したことが分かるよう、呼び出し側で件数を出す前提）。
 *
 * @param {number} current 現在の添字（未選択なら -1）
 * @param {number} total 一致件数
 * @param {number} direction +1 で次、-1 で前
 * @returns {number} 移動後の添字。total が 0 なら -1
 */
export function stepIndex(current, total, direction) {
  if (!total || total <= 0) return -1
  const dir = direction < 0 ? -1 : 1
  if (current < 0) return dir > 0 ? 0 : total - 1
  return (current + dir + total) % total
}

/**
 * 件数表示。0 件と未検索を区別する（未検索で「0 件」と出すと、
 * 打ち始める前から失敗しているように見える）。
 *
 * @param {number} index 現在の添字（-1 なら未選択）
 * @param {number} total
 * @returns {string} 例 '3 / 17' / '0 / 0' / ''
 */
export function formatCount(index, total) {
  if (!total || total <= 0) return '0 / 0'
  return `${index < 0 ? 0 : index + 1} / ${total}`
}

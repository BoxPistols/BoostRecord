// CodeMirror の中の検索と置換。Markdown ノートのエディタとスニペットノートの
// 両方から使う。一致の判定は findInText.js に任せ、ここは位置の変換と書き換えだけを持つ。
// 片方の画面だけに実装すると、もう片方で検索が効かないまま気づかれない（v0.21.0 の退行）
//
// 一致の位置は文字の添字ではなく markText のマークで持つ。検索を開いたまま本文を
// 編集すると添字は古くなるが、マークは編集に追随する。古い添字で置換すると別の場所を書き換える

import { findMatches } from './findInText'

const MARK_CLASS = 'tb-find-all'

/**
 * 一致をすべて塗る
 * @param {Object} cm CodeMirror
 * @param {string} query
 * @returns {Array} マーク（文書順）
 */
export function markMatches(cm, query) {
  if (!cm || !query) return []
  return findMatches(cm.getValue(), query).map(hit =>
    cm.markText(cm.posFromIndex(hit.start), cm.posFromIndex(hit.end), {
      className: MARK_CLASS
    })
  )
}

export function clearMarks(marks) {
  if (marks) marks.forEach(mark => mark.clear())
}

// マークの今の範囲。中身を消されたマークは CodeMirror が外すので null
function rangeOf(mark) {
  const range = mark && mark.find()
  return range && range.from ? range : null
}

/** 一致を選択して見える位置まで送る */
export function selectMark(cm, mark) {
  const range = cm && rangeOf(mark)
  if (!range) return
  cm.setSelection(range.from, range.to)
  cm.scrollIntoView(range, 120)
}

/**
 * 1件を置き換える
 * @returns {number} 置き換えた文字列の終わりの添字（次の一致を探し始める位置）。
 *   マークが消えていれば -1（何もしない）
 */
export function replaceMark(cm, mark, replacement) {
  const range = cm && rangeOf(mark)
  if (!range) return -1
  const start = cm.indexFromPos(range.from)
  cm.replaceRange(replacement, range.from, range.to, 'replace')
  return start + replacement.length
}

/**
 * すべて置き換える。後ろから当てる。前から当てると、置き換えで長さが変わった分だけ
 * 後ろの位置がずれて、2件目以降が別の場所を書き換える。
 * 1回の operation にまとめるので、元に戻すも1回で済む
 * @returns {number} 置き換えた件数
 */
export function replaceAllMarks(cm, marks, replacement) {
  if (!cm || !marks) return 0
  const ranges = marks
    .map(rangeOf)
    .filter(Boolean)
    .sort((a, b) => cm.indexFromPos(b.from) - cm.indexFromPos(a.from))
  if (ranges.length === 0) return 0
  cm.operation(() => {
    ranges.forEach(range => {
      cm.replaceRange(replacement, range.from, range.to, 'replace')
    })
  })
  return ranges.length
}

/**
 * offset より後ろにある最初の一致の添字。置換後の文字列が検索語を含む（a → aa）ときに、
 * 同じ場所を選び続けないため
 * @returns {number} 無ければ先頭へ回り込む。0件なら -1
 */
export function indexAfter(cm, marks, offset) {
  if (!marks || marks.length === 0) return -1
  for (let i = 0; i < marks.length; i++) {
    const range = rangeOf(marks[i])
    if (range && cm.indexFromPos(range.from) >= offset) return i
  }
  return 0
}

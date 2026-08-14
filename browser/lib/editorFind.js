// CodeMirror のドキュメントに対する「探す・移動する・置換する」。
// DOM も React も持ち込まないので、エディタを持つ画面（Markdown ノート /
// スニペットノート）で同じ実装を共有できる。当たり判定は findInText の
// findMatches に委ねる（大文字小文字・全角・重なりの規則を1箇所に保つ）。
import { findMatches } from 'browser/lib/findInText'

/** markText の戻りをまとめて消す。null 安全（未検索でも呼べる） */
export function clearMarks(marks) {
  if (!marks) return
  marks.forEach(mark => mark && mark.clear())
}

/**
 * 一致箇所を全部ハイライトする。
 * @returns {{hits: Array<{start:number,end:number}>, marks: Array}}
 */
export function markMatches(cm, query) {
  if (!cm || !query) return { hits: [], marks: [] }
  const hits = findMatches(cm.getValue(), query)
  const marks = hits.map(hit =>
    cm.markText(cm.posFromIndex(hit.start), cm.posFromIndex(hit.end), {
      className: 'tb-find-all'
    })
  )
  return { hits, marks }
}

/** 現在地へ移動する。選択して画面内に入れるだけ（本文は変えない） */
export function revealHit(cm, hit) {
  if (!cm || !hit) return false
  const from = cm.posFromIndex(hit.start)
  const to = cm.posFromIndex(hit.end)
  cm.setSelection(from, to)
  cm.scrollIntoView({ from, to }, 120)
  return true
}

/** 1件だけ置換する。置換後の位置は呼び出し側が探し直す前提 */
export function replaceHit(cm, hit, replacement) {
  if (!cm || !hit) return false
  const text = replacement == null ? '' : String(replacement)
  cm.replaceRange(
    text,
    cm.posFromIndex(hit.start),
    cm.posFromIndex(hit.end),
    '*replace'
  )
  return true
}

/**
 * まとめて置換する。
 * **後ろから当てる。** 前から置換すると、置換で長さが変わった分だけ後続の
 * 位置がずれ、2件目以降が別の場所を壊す。
 * @returns {number} 置換した件数
 */
export function replaceAllHits(cm, hits, replacement) {
  if (!cm || !hits || hits.length === 0) return 0
  const text = replacement == null ? '' : String(replacement)
  const apply = () => {
    for (let i = hits.length - 1; i >= 0; i--) {
      cm.replaceRange(
        text,
        cm.posFromIndex(hits[i].start),
        cm.posFromIndex(hits[i].end),
        // origin を揃えると CodeMirror の履歴がまとめてくれるので、
        // 取り消しが1回で済む（1件ずつ戻ると数十回押すことになる）
        '+replaceAll'
      )
    }
  }
  if (typeof cm.operation === 'function') cm.operation(apply)
  else apply()
  return hits.length
}

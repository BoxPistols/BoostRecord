// CodeMirror のドキュメントに対する「探す・移動する・置換する」。
// DOM も React も持ち込まないので、エディタを持つ画面（Markdown ノート /
// スニペットノート）で同じ実装を共有できる。当たり判定は findInText の
// findMatches に委ねる（大文字小文字・全角・重なりの規則を1箇所に保つ）。
//
// **位置は数値のオフセットで持たない。** 検索した後に本文が変わると
// （利用者の編集・ノートの切り替え・置換そのもの）、captured したオフセットは
// 別の場所を指す。その状態で置換すると**無関係な文字を書き換える**。
// CodeMirror の markText は本文の変化に追随するので、位置はマークに持たせ、
// 使う直前に mark.find() で取り直す。消えたマークは null を返すので捨てる。
import { findMatches } from 'browser/lib/findInText'

/** markText の戻りをまとめて消す。null 安全（未検索でも呼べる） */
export function clearMarks(marks) {
  if (!marks) return
  marks.forEach(mark => mark && mark.clear())
}

/**
 * 一致箇所を全部ハイライトする。
 * @returns {{hits: Array<{start:number,end:number}>, marks: Array}}
 *   hits は件数と順序の確認用。**位置の真実は marks 側**
 */
export function markMatches(cm, query) {
  if (!cm || !query) return { hits: [], marks: [] }
  const hits = findMatches(cm.getValue(), query)
  const marks = []
  const apply = () => {
    hits.forEach(hit => {
      marks.push(
        cm.markText(cm.posFromIndex(hit.start), cm.posFromIndex(hit.end), {
          className: 'tb-find-all'
        })
      )
    })
  }
  // 1件ずつ markText を呼ぶと、そのたびに再描画・再計測が走る。
  // 打鍵のたびに走る処理なので、長い本文で入力が目に見えて遅れる
  if (typeof cm.operation === 'function') cm.operation(apply)
  else apply()
  return { hits, marks }
}

/**
 * マークが今どこにあるか。消えていれば null。
 * **使う直前に必ずこれを通す。** 検索時の位置をそのまま使ってはいけない
 */
export function rangeOfMark(mark) {
  if (!mark || typeof mark.find !== 'function') return null
  const range = mark.find()
  if (!range || !range.from || !range.to) return null
  return range
}

/** 現在地へ移動する。選択して画面内に入れるだけ（本文は変えない） */
export function revealHit(cm, mark) {
  const range = rangeOfMark(mark)
  if (!cm || !range) return false
  cm.setSelection(range.from, range.to)
  cm.scrollIntoView({ from: range.from, to: range.to }, 120)
  return true
}

/**
 * 現在地の1件だけ色を変える。
 * **選択だけでは足りない。** 全一致の背景は構文色に勝つため `!important` で
 * 塗っており、選択範囲の背景（CodeMirror は文字の後ろの層に描く）を覆う。
 * プレビュー側は tb-find-active を持っているので、同じ名前で揃える
 * @returns {object|null} 付けた印。消すのは呼び出し側の責任
 */
export function markActive(cm, mark) {
  const range = rangeOfMark(mark)
  if (!cm || !range) return null
  return cm.markText(range.from, range.to, { className: 'tb-find-active' })
}

/** 1件だけ置換する。置換後の位置は呼び出し側が探し直す前提 */
export function replaceHit(cm, mark, replacement) {
  const range = rangeOfMark(mark)
  if (!cm || !range) return false
  const text = replacement == null ? '' : String(replacement)
  cm.replaceRange(text, range.from, range.to, '*replace')
  return true
}

/**
 * まとめて置換する。
 * マークは置換のたびに追随するので、順序はどちらでもよいが、
 * 後ろから当てると画面のスクロール位置が動きにくい。
 * @returns {number} 実際に置換した件数（消えたマークは数えない）
 */
export function replaceAllHits(cm, marks, replacement) {
  if (!cm || !marks || marks.length === 0) return 0
  const text = replacement == null ? '' : String(replacement)
  let replaced = 0
  const apply = () => {
    for (let i = marks.length - 1; i >= 0; i--) {
      const range = rangeOfMark(marks[i])
      if (!range) continue
      cm.replaceRange(
        text,
        range.from,
        range.to,
        // origin を揃えると CodeMirror の履歴がまとめてくれるので、
        // 取り消しが1回で済む（1件ずつ戻ると数十回押すことになる）
        '+replaceAll'
      )
      replaced += 1
    }
  }
  if (typeof cm.operation === 'function') cm.operation(apply)
  else apply()
  return replaced
}

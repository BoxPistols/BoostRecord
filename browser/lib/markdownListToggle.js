// 選択した複数行をまとめて箇条書き / 番号付き / チェックリストにする。
//
// エディタ（CodeMirror）から切り離した純粋関数にしてある。行の書き換えは
// 境界条件（インデント・空行・既に別種のリスト・番号の振り直し）で壊れやすく、
// 実際に選択してみないと分からない挙動をテストで固めたいため。

export const UL = 'ul'
export const OL = 'ol'
export const TASK = 'task'

// 先頭の空白（インデント）を保つ。タブ・全角混じりでもそのまま返す
const INDENT = /^[ \t]*/

// 既存のリスト記号。順序は重要:
// タスク（- [ ]）は箇条書き（-）に前方一致するので先に見る
const TASK_RE = /^([ \t]*)([-*+])\s+\[( |x|X)\]\s+/
const UL_RE = /^([ \t]*)([-*+])\s+/
const OL_RE = /^([ \t]*)(\d+)([.)])\s+/

function indentOf(line) {
  const m = line.match(INDENT)
  return m ? m[0] : ''
}

/** 行から既存のリスト記号を外して本文だけにする */
export function stripMarker(line) {
  if (TASK_RE.test(line)) return line.replace(TASK_RE, '$1')
  if (OL_RE.test(line)) return line.replace(OL_RE, '$1')
  if (UL_RE.test(line)) return line.replace(UL_RE, '$1')
  return line
}

/** その行が指定種別のリストになっているか */
export function hasMarker(line, kind) {
  if (kind === TASK) return TASK_RE.test(line)
  // 箇条書き判定はタスクを含めない（- [ ] は「箇条書きではない」扱い）。
  // 含めると、タスク行だけを選んで箇条書きボタンを押した時に
  // 「全部付いている」と誤判定して解除になってしまう
  if (kind === UL) return UL_RE.test(line) && !TASK_RE.test(line)
  if (kind === OL) return OL_RE.test(line)
  return false
}

function isBlank(line) {
  return line.trim() === ''
}

/**
 * 選択範囲の行をまとめて切り替える。
 *
 * 判定は「対象行が**すべて**その種別になっていれば解除、そうでなければ付与」。
 * 一部だけ付いている状態で押したら全部揃う方が、押すたびに歯抜けが増えるより
 * 扱いやすい。
 *
 * 空行は対象外（記号だけの行が量産されるのを防ぐ）。ただし選択が空行だけの
 * 場合は、その行に付ける（そこから書き始めたいはずなので）。
 *
 * @param {string[]} lines 選択範囲の行
 * @param {'ul'|'ol'|'task'} kind
 * @returns {string[]} 同じ長さの行
 */
export function toggleLines(lines, kind) {
  if (!Array.isArray(lines) || lines.length === 0) return lines
  if ([UL, OL, TASK].indexOf(kind) === -1) return lines

  const targets = lines.some(l => !isBlank(l))
    ? lines.map(l => !isBlank(l))
    : lines.map(() => true)

  const allMarked = lines.every((l, i) => !targets[i] || hasMarker(l, kind))

  let counter = 0
  return lines.map((line, i) => {
    if (!targets[i]) return line
    const body = stripMarker(line)
    if (allMarked) return body
    const indent = indentOf(body)
    const text = body.slice(indent.length)
    counter += 1
    if (kind === OL) return `${indent}${counter}. ${text}`
    if (kind === TASK) return `${indent}- [ ] ${text}`
    return `${indent}- ${text}`
  })
}

/**
 * 複数行テキストに対して適用する薄いラッパ。
 * 末尾の改行は保つ（選択範囲の最後が行末で終わる場合に行が増えないように）。
 *
 * @param {string} text
 * @param {'ul'|'ol'|'task'} kind
 * @returns {string}
 */
export function toggleText(text, kind) {
  if (typeof text !== 'string') return text
  const trailing = text.endsWith('\n') ? '\n' : ''
  const body = trailing ? text.slice(0, -1) : text
  return toggleLines(body.split('\n'), kind).join('\n') + trailing
}

/**
 * CodeMirror の選択範囲へ適用する。
 *
 * cm は引数で受けるだけで import しない（このモジュールを CodeMirror 抜きで
 * 単体テストできるようにするため）。複数選択がある場合は、覆っている行の
 * 最小〜最大をひと続きとして扱う（通常の1範囲選択ではこれが正確に一致する）。
 *
 * @param {object} cm CodeMirror インスタンス
 * @param {'ul'|'ol'|'task'} kind
 */
export function toggleListInEditor(cm, kind) {
  if (!cm || typeof cm.listSelections !== 'function') return
  const selections = cm.listSelections()
  if (!selections || !selections.length) return

  let first = Infinity
  let last = -Infinity
  selections.forEach(range => {
    first = Math.min(first, range.anchor.line, range.head.line)
    last = Math.max(last, range.anchor.line, range.head.line)
  })
  if (!isFinite(first) || !isFinite(last)) return

  const lines = []
  for (let i = first; i <= last; i++) lines.push(cm.getLine(i))
  const next = toggleLines(lines, kind)
  // 変化が無い時は書き換えない（undo 履歴に空の1手を積まない）
  if (next.join('\n') === lines.join('\n')) return

  cm.replaceRange(
    next.join('\n'),
    { line: first, ch: 0 },
    { line: last, ch: lines[lines.length - 1].length }
  )
  // 書き換え後も同じ範囲を選んだままにする（続けて別の種別へ切り替えられる）
  cm.setSelection(
    { line: first, ch: 0 },
    { line: last, ch: next[next.length - 1].length }
  )
}

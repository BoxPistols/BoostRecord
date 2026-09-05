// 元の文章と直した文章の差分を「取捨選択できる塊」に切る。Electron 依存なし。
//
// 行単位の差分を取り、連続する変更（削除と追加）を 1 つの塊（hunk）にする。
// 利用者は塊ごとに採用するか決め、applyHunks で採用した塊だけを反映した
// 全文を作る。段落単位の判断に合わせるため、行より細かい単位には切らない。
import { diffLines } from 'diff'

/**
 * @param {string} before 元の文章
 * @param {string} after 直した文章
 * @returns {Array<{type:'equal', lines:string[]} | {type:'change', id:number, removed:string[], added:string[]}>}
 */
export function buildHunks(before, after) {
  const parts = diffLines(String(before || ''), String(after || ''))
  const out = []
  let pending = null
  let nextId = 0
  // 塊の先頭・末尾で同じ行が並んでいたら塊から外す。行差分は最小編集を選ぶので
  // 「A を消して A を足す」形が出ることがあり、そのままだと消して足し直したように
  // 見える（実機で確認）。同じ行は変更ではないので「変更なし」に戻す
  const pushEqual = lines => {
    if (!lines.length) return
    const last = out[out.length - 1]
    if (last && last.type === 'equal') last.lines.push(...lines)
    else out.push({ type: 'equal', lines })
  }
  const flush = () => {
    if (!pending) return
    const { removed, added } = pending
    let head = 0
    while (
      head < removed.length &&
      head < added.length &&
      removed[head] === added[head]
    ) {
      head++
    }
    let tail = 0
    while (
      tail < removed.length - head &&
      tail < added.length - head &&
      removed[removed.length - 1 - tail] === added[added.length - 1 - tail]
    ) {
      tail++
    }
    pushEqual(removed.slice(0, head))
    const core = {
      type: 'change',
      removed: removed.slice(head, removed.length - tail),
      added: added.slice(head, added.length - tail)
    }
    // 追加も削除も無い塊は作らない
    if (core.removed.length || core.added.length) {
      core.id = nextId++
      out.push(core)
    }
    pushEqual(tail ? removed.slice(removed.length - tail) : [])
    pending = null
  }
  const toLines = value => {
    const lines = value.split('\n')
    // 末尾の改行で生まれる空要素は落とす（行の並びとしては存在しない）
    if (lines.length && lines[lines.length - 1] === '') lines.pop()
    return lines
  }
  parts.forEach(part => {
    if (part.added || part.removed) {
      if (!pending) pending = { type: 'change', removed: [], added: [] }
      if (part.removed) pending.removed.push(...toLines(part.value))
      else pending.added.push(...toLines(part.value))
      return
    }
    flush()
    pushEqual(toLines(part.value))
  })
  flush()
  return out
}

/**
 * 採用した塊だけを反映した全文を作る。
 * @param {Array} hunks buildHunks の戻り
 * @param {Set<number>|number[]} selected 採用する塊の id
 * @param {string} [after] 末尾の改行の有無を after に合わせる
 */
export function applyHunks(hunks, selected, after) {
  const chosen = selected instanceof Set ? selected : new Set(selected || [])
  const lines = []
  hunks.forEach(h => {
    if (h.type === 'equal') lines.push(...h.lines)
    else if (chosen.has(h.id)) lines.push(...h.added)
    else lines.push(...h.removed)
  })
  let text = lines.join('\n')
  if (after != null && /\n$/.test(after)) text += '\n'
  return text
}

/** 変更の塊の数 */
export function countChanges(hunks) {
  return hunks.filter(h => h.type === 'change').length
}

/**
 * @fileoverview ノートの中の重複箇所を探す（本文は書き換えない）。
 * 完全一致は端末内で行単位に調べ、続けて重なる行はひとまとまりにする。
 * 意味の重複はAIに引用で挙げさせ、本文に実在する引用だけを残す（作り話の引用を出さない）。
 * 箇所はどちらも本文の文字位置 {start, end} で返し、エディタの移動に使う。
 */

// これより短い行は、見出しの記号や「以上」などのありふれた行が当たりやすいので数えない
export const MIN_LINE_LENGTH = 8

const FENCE_PATTERN = /^\s*(```|~~~)/
// 箇条書きの記号と番号は比べるときに外す（「- 同じ文」と「・同じ文」を同じとみなす）
const LIST_MARKER = /^\s*(?:[-*+・•]|\d+[.)])\s+|^\s*[・•]/
// 区切り線や表の区切りは中身を持たない
const RULE_ONLY = /^[\s\-=*_|:]+$/

export function normalizeLine(line) {
  return line
    .replace(LIST_MARKER, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function lineOffsets(lines) {
  const out = []
  let at = 0
  lines.forEach(line => {
    out.push(at)
    at += line.length + 1
  })
  return out
}

/**
 * 同じ中身の行（続けて重なる行はまとめる）を探す
 * @param {string} text
 * @returns {Array<{kind: 'exact', text: string, occurrences: Array<{start: number, end: number, line: number}>}>}
 */
export function findExactDuplicates(text) {
  const lines = String(text || '').split('\n')
  const offsets = lineOffsets(lines)
  // 比べる対象の行だけ正規化する。コードブロックの中は対象外
  const norm = []
  let inFence = false
  lines.forEach((line, i) => {
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence
      norm[i] = null
      return
    }
    const n = inFence ? '' : normalizeLine(line)
    norm[i] = n.length >= MIN_LINE_LENGTH && !RULE_ONLY.test(n) ? n : null
  })

  const byText = new Map()
  norm.forEach((n, i) => {
    if (n == null) return
    if (!byText.has(n)) byText.set(n, [])
    byText.get(n).push(i)
  })

  const used = new Set()
  const groups = []
  norm.forEach((n, i) => {
    if (n == null || used.has(i)) return
    const starts = byText.get(n)
    if (!starts || starts.length < 2 || starts[0] !== i) return
    // すべての出現で次の行も同じ間は、ひとまとまりとして伸ばす
    let length = 1
    for (;;) {
      const next = starts.map(s => s + length)
      const first = norm[next[0]]
      if (
        first == null ||
        next.some(k => k >= norm.length || norm[k] !== first) ||
        next.some(k => starts.indexOf(k) !== -1)
      ) {
        break
      }
      length++
    }
    starts.forEach(s => {
      for (let k = 0; k < length; k++) used.add(s + k)
    })
    groups.push({
      kind: 'exact',
      text: lines.slice(i, i + length).join('\n'),
      occurrences: starts.map(s => {
        const last = s + length - 1
        return {
          line: s,
          start: offsets[s],
          end: offsets[last] + lines[last].length,
          text: lines.slice(s, last + 1).join('\n')
        }
      })
    })
  })
  return groups
}

/**
 * 意味の重複をAIに挙げさせるための指示
 */
export const SEMANTIC_SYSTEM = [
  'You find redundant passages in a note: places that say the same thing in different words.',
  'Do not report passages that are word-for-word identical; those are found separately.',
  'Return only JSON: {"groups":[{"reason":"<one short sentence in the language of the note>","quotes":["<exact quote 1>","<exact quote 2>"]}]}.',
  'Each quote must be copied exactly from the note (same characters, no edits, no ellipsis) and be one sentence or one list item. Each group needs at least two quotes from different places.',
  'If there is nothing redundant, return {"groups":[]}.'
].join('\n')

/**
 * AIの応答から意味の重複を取り出す。本文に無い引用は落とし、2か所未満になった組は出さない。
 * 完全一致で既に挙げた組と同じものも落とす
 * @param {string} content AIの応答
 * @param {string} text 本文
 * @param {Array} exactGroups findExactDuplicatesの結果
 * @returns {{parsed: boolean, groups: Array<{kind: 'semantic', reason: string, occurrences: Array}>}}
 */
export function parseSemanticGroups(content, text, exactGroups) {
  const src = String(content || '')
    .replace(/```(?:json)?\s*/g, '')
    .replace(/```/g, '')
  const m = src.match(/\{[\s\S]*\}/)
  if (!m) return { parsed: false, groups: [] }
  let data
  try {
    data = JSON.parse(m[0])
  } catch (e) {
    return { parsed: false, groups: [] }
  }
  if (!data || !Array.isArray(data.groups)) return { parsed: false, groups: [] }
  const body = String(text || '')
  const exactTexts = new Set(
    (exactGroups || []).map(g => normalizeLine(g.text.split('\n')[0]))
  )
  const groups = []
  data.groups.forEach(g => {
    if (!g || !Array.isArray(g.quotes)) return
    const seen = new Set()
    const occurrences = []
    g.quotes.forEach(q => {
      const quote = String(q || '').trim()
      if (!quote) return
      const start = body.indexOf(quote)
      if (start === -1 || seen.has(start)) return
      seen.add(start)
      occurrences.push({
        start,
        end: start + quote.length,
        text: quote,
        line: body.slice(0, start).split('\n').length - 1
      })
    })
    if (occurrences.length < 2) return
    const norms = occurrences.map(o =>
      normalizeLine(body.slice(o.start, o.end))
    )
    // 引用がすべて同じ中身なら完全一致の組と重なる
    if (norms.every(n => n === norms[0]) && exactTexts.has(norms[0])) return
    groups.push({
      kind: 'semantic',
      reason: String(g.reason || ''),
      occurrences: occurrences.sort((a, b) => a.start - b.start)
    })
  })
  return { parsed: true, groups }
}

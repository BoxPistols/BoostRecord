// ノート内検索の「探す」部分。DOM も CodeMirror も持ち込まない純粋関数。
// デスクトップ版（browser/lib/findInText.js）と同じ判定にしてある。
// エディタとプレビューの両方をこれで探すので、ここがずれると片方だけ件数が合わない

export interface Match {
  start: number
  end: number
}

interface Options {
  caseSensitive?: boolean
}

/**
 * text の中から query に一致する位置をすべて返す。
 * 重なる一致は数えない（`aa` を `aaa` から探すと 1 件）。数えると
 * 「次へ」で同じ場所に留まって見えるため
 */
export function findMatches(text: unknown, query: unknown, options: Options = {}): Match[] {
  if (typeof text !== 'string' || typeof query !== 'string') return []
  if (query === '') return []

  // 複数行の検索語。空白と改行の違いはエディタとプレビューで食い違う（プレビューは
  // 空行の数が変わり、ブロックの区切りに文字が無いこともある）ので、並びとして照合する
  if (/\s/.test(query) && query.trim() !== '') {
    return findFlexibleMatches(text, query, options)
  }

  const haystack = options.caseSensitive ? text : text.toLowerCase()
  const needle = options.caseSensitive ? query : query.toLowerCase()
  // 大文字小文字を畳むと長さが変わる文字（ẞ 等）があると位置がずれる。そのときは畳まない
  if (haystack.length !== text.length || needle.length !== query.length) {
    return findMatches(text, query, { caseSensitive: true })
  }

  const out: Match[] = []
  let from = 0
  for (;;) {
    const index = haystack.indexOf(needle, from)
    if (index === -1) break
    out.push({ start: index, end: index + needle.length })
    from = index + needle.length
  }
  return out
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 空白を含む検索語の照合。改行を含む空白の並びは0文字以上の空白に、
 * 空白だけの並びは1文字以上の空白に当てる。前後の空白は無視する
 */
function findFlexibleMatches(text: string, query: string, options: Options): Match[] {
  const source = query
    .trim()
    .split(/(\s+)/)
    .map(part => {
      if (!/^\s+$/.test(part)) return escapeRegExp(part)
      return /\n/.test(part) ? '\\s*' : '\\s+'
    })
    .join('')
  const re = new RegExp(source, options.caseSensitive ? 'g' : 'gi')
  const out: Match[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[0].length === 0) {
      re.lastIndex++
      continue
    }
    out.push({ start: m.index, end: m.index + m[0].length })
  }
  return out
}

/** 「次へ / 前へ」でどの一致に移るか。端は反対側へ回り込む。0 件なら -1 */
export function stepIndex(current: number, total: number, direction: number): number {
  if (!total || total <= 0) return -1
  const dir = direction < 0 ? -1 : 1
  if (current < 0) return dir > 0 ? 0 : total - 1
  return (current + dir + total) % total
}

/** offset 以降で最初の一致。無ければ先頭へ回り込む（置換の後に次の一致を選ぶ） */
export function indexAfter(matches: Match[], offset: number): number {
  if (matches.length === 0) return -1
  const i = matches.findIndex(m => m.start >= offset)
  return i === -1 ? 0 : i
}

/**
 * 件数表示。0 件と未検索を区別する（未検索で「0 件」と出すと、
 * 打ち始める前から失敗しているように見える）
 */
export function formatCount(index: number, total: number): string {
  if (!total || total <= 0) return '0 / 0'
  return `${index < 0 ? 0 : index + 1} / ${total}`
}

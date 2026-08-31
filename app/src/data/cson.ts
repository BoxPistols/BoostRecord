// Boostnote のノート `.cson` を、ブラウザで読み書きする。
//
// `cson-parser` は文字列リテラルごとに Node の `vm.runInThisContext` を呼ぶ。
// ブラウザ向けのビルドでは `vm` が空のスタブに置き換わるので、読み込んだ
// 瞬間に TypeError で落ちる。`vm` を eval で埋めるのは、ノートの中身を
// コードとして実行する口を開けることになるので採らない。
//
// 扱うのは Boostnote が書く形だけ。`cson-parser` の stringify が出す
// 「1 行 1 キー、文字列は単引用符、複数行は ''' のヒアドキュメント、配列と
// オブジェクトは括弧を行で開いて閉じる」に限定する。
//
// **保存は「読んで書き直す」ではなく「その行だけ差し替える」。** 解釈できない
// 値（SNIPPET_NOTE の snippets など）を書き戻しで壊さないため、触らない範囲は
// 元のテキストのまま残す。

const INDENT = '  '

/** 1 つの top-level エントリが占める行の範囲 */
interface Entry {
  key: string
  /** 開始行（`key:` の行） */
  start: number
  /** 終了行（この行を含む） */
  end: number
  /** `key:` の後ろ、1 行目の残り */
  head: string
  lines: string[]
}

const KEY_LINE = /^([A-Za-z_$][\w$]*|'[^']*'|"[^"]*"):[ \t]*(.*)$/

function unquoteKey(key: string) {
  if (
    (key.startsWith("'") && key.endsWith("'")) ||
    (key.startsWith('"') && key.endsWith('"'))
  ) {
    return key.slice(1, -1)
  }
  return key
}

/** top-level のエントリを行の範囲つきで拾う */
function scanEntries(lines: string[]): Entry[] {
  const entries: Entry[] = []
  let i = 0
  while (i < lines.length) {
    const m = KEY_LINE.exec(lines[i])
    if (!m) {
      i++
      continue
    }
    const head = m[2]
    let end = i
    if (head.startsWith("'''")) {
      // ヒアドキュメント。閉じは列 0 の '''
      end = i + 1
      while (end < lines.length && lines[end] !== "'''") end++
    } else if (head.startsWith('[') && !head.includes(']')) {
      end = i + 1
      while (end < lines.length && lines[end] !== ']') end++
    } else if (head.startsWith('{') && !head.includes('}')) {
      end = i + 1
      while (end < lines.length && lines[end] !== '}') end++
    }
    entries.push({
      key: unquoteKey(m[1]),
      start: i,
      end,
      head,
      lines: lines.slice(i, end + 1)
    })
    i = end + 1
  }
  return entries
}

/** 単引用符・二重引用符の 1 行文字列。読めなければ undefined */
function parseScalarString(token: string): string | undefined {
  const t = token.trim()
  if (t.length < 2) return undefined
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string
    } catch {
      return undefined
    }
  }
  if (t.startsWith("'") && t.endsWith("'")) {
    // 単引用符の中では \' と \\ だけがエスケープされる
    return t.slice(1, -1).replace(/\\(['\\])/g, '$1')
  }
  return undefined
}

/**
 * ヒアドキュメントの本文。共通の字下げを外し、エスケープを戻す。
 *
 * `'''` の中でエスケープされるのは `\\` と、閉じ記号にならないための `\'''` だけ。
 * 素の `'` やタブはそのまま入る
 */
function parseHeredoc(lines: string[]): string {
  const body = lines.slice(1, -1)
  if (body.length === 0) return ''
  const indents = body
    .filter(l => l.trim() !== '')
    .map(l => (l.match(/^[ \t]*/) || [''])[0].length)
  const strip = indents.length ? Math.min(...indents) : 0
  return body
    .map(l => l.slice(strip))
    .join('\n')
    .replace(/\\(['\\])/g, '$1')
}

function parseValue(entry: Entry): unknown {
  const head = entry.head

  if (head.startsWith("'''")) return parseHeredoc(entry.lines)

  if (head === 'true') return true
  if (head === 'false') return false
  if (head === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(head)) return Number(head)

  if (head.startsWith('[')) {
    // 行で開く配列。文字列だけを拾う（tags 用）。それ以外は解釈しない
    if (head.trim() === '[]') return []
    if (entry.lines.length === 1) return undefined
    const items: string[] = []
    for (const line of entry.lines.slice(1, -1)) {
      const value = parseScalarString(line)
      if (value === undefined) return undefined // 文字列以外を含む配列は触らない
      items.push(value)
    }
    return items
  }

  if (head.startsWith('{')) return undefined // ネストしたオブジェクトは読まない

  return parseScalarString(head)
}

/**
 * ノートの `.cson` を読む。**解釈できた top-level のキーだけ**を返す。
 * 読めなかったキーは結果に含まれない（呼び出し側は既定値で埋める）。
 */
export function parseNoteCson(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const entry of scanEntries(text.split('\n'))) {
    const value = parseValue(entry)
    if (value !== undefined) out[entry.key] = value
  }
  return out
}

/* ── 書き出し ───────────────────────────────────────────────────────── */

function escapeHeredoc(value: string): string {
  // 順序が要る。先にバックスラッシュを倍にしてから、閉じ記号を潰す
  return value.replace(/\\/g, '\\\\').replace(/'''/g, "\\'''")
}

function formatString(value: string): string[] {
  if (value.includes('\n')) {
    const body = escapeHeredoc(value)
      .split('\n')
      .map(l => (l === '' ? INDENT : INDENT + l))
    return ["'''", ...body, "'''"]
  }
  if (value.includes("'") || value.includes('\\')) {
    return [JSON.stringify(value)]
  }
  return [`'${value}'`]
}

/** `key: value` を行の配列にする */
function formatEntry(key: string, value: unknown): string[] {
  if (typeof value === 'string') {
    const parts = formatString(value)
    if (parts.length === 1) return [`${key}: ${parts[0]}`]
    // ヒアドキュメント。開き ''' は key の行に続ける
    return [`${key}: ${parts[0]}`, ...parts.slice(1)]
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${key}: []`]
    const items = value.map(v =>
      typeof v === 'string' ? INDENT + formatString(v)[0] : INDENT + String(v)
    )
    return [`${key}: [`, ...items, ']']
  }
  if (value === null) return [`${key}: null`]
  return [`${key}: ${String(value)}`]
}

/**
 * **指定したキーの行だけを差し替える。** 他の行は 1 バイトも変えない。
 * 元に無いキーは末尾に足す。
 */
export function updateNoteCson(
  text: string,
  updates: Record<string, unknown>
): string {
  const lines = text.split('\n')
  const entries = scanEntries(lines)
  const byKey = new Map(entries.map(e => [e.key, e]))

  // 後ろから差し替えて、行番号がずれないようにする
  const targets = entries
    .filter(e => Object.prototype.hasOwnProperty.call(updates, e.key))
    .sort((a, b) => b.start - a.start)

  let out = lines.slice()
  for (const entry of targets) {
    out.splice(
      entry.start,
      entry.end - entry.start + 1,
      ...formatEntry(entry.key, updates[entry.key])
    )
  }

  const added = Object.keys(updates).filter(k => !byKey.has(k))
  if (added.length) {
    // 末尾の空行の手前に足す
    while (out.length && out[out.length - 1] === '') out.pop()
    for (const key of added) out.push(...formatEntry(key, updates[key]))
  }
  return out.join('\n')
}

/** 新しいノートを書き出す。キーの順は渡された順 */
export function stringifyNoteCson(obj: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue
    lines.push(...formatEntry(key, value))
  }
  return lines.join('\n')
}

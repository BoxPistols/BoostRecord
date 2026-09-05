// 読み上げ用のテキスト整形と分割。Electron 依存なし。
//
// Markdown の記号をそのまま読むと「シャープ シャープ」「アスタリスク」と
// 読まれるので本文だけに落とす。長文は一度に合成すると VOICEVOX が数十秒
// 黙るため、文の切れ目で短い塊に分けて 1 塊ずつ合成・再生する。
//
// 塊には元の行番号（0 始まり）を持たせる。いま読んでいる位置をエディタと
// プレビューでハイライトするのに使う。

// 1 塊が長いほど合成待ちが伸びる（VOICEVOX は 100 字で 1 秒前後）。
// 短くして先読みで繋ぐ方が体感が滑らか
const DEFAULT_MAX_CHUNK = 120

// 表の区切り行（|---|---|）。読み上げても意味が無いので行ごと落とす
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/

/** 1 行ぶんの記号落とし。行を跨ぐ処理は markdownToSpeechLines が持つ */
function cleanInline(input) {
  let s = input
  // 画像は alt、リンクは表示文字
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
  // 表のセルは読点で繋ぐ
  s = s.replace(/^[ \t]*\|(.*)\|[ \t]*$/, (m, row) =>
    row
      .split('|')
      .map(c => c.trim())
      .filter(Boolean)
      .join('、')
  )
  // 行頭の記号: 見出し・引用・箇条書き・番号・チェックボックス
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/, '')
  s = s.replace(/^[ \t]*>[ \t]?/, '')
  s = s.replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/, '')
  s = s.replace(/^[ \t]*[-*+][ \t]+/, '')
  s = s.replace(/^[ \t]*\d+[.)][ \t]+/, '')
  // 水平線
  s = s.replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/, '')
  // 強調・打ち消し・インラインコード
  s = s.replace(/(\*{1,3}|_{1,3}|~~)(\S.*?)\1/g, '$2')
  s = s.replace(/`([^`\n]+)`/g, '$1')
  // 残った単独の記号行
  s = s.replace(/^[ \t]*[*_#>|=]+[ \t]*$/, '')
  return s.trim()
}

/**
 * Markdown を読み上げ向けの行の並びにする。
 * 空行は段落の区切りとして残す（text が空の要素）。
 * frontmatter・コードブロック・HTML コメントの行は要素ごと落とす。
 *
 * @param {string} md
 * @returns {Array<{text: string, line: number}>} line は 0 始まりの元の行番号
 */
export function markdownToSpeechLines(md) {
  if (!md) return []
  const src = String(md)
    .replace(/\r\n?/g, '\n')
    .split('\n')
  const out = []
  let inFence = false
  let fenceMark = ''
  let inComment = false
  let inFrontmatter = false

  src.forEach((raw, line) => {
    let s = raw
    // frontmatter は先頭の --- から次の --- まで
    if (line === 0 && /^---[ \t]*$/.test(s)) {
      inFrontmatter = true
      return
    }
    if (inFrontmatter) {
      if (/^---[ \t]*$/.test(s)) inFrontmatter = false
      return
    }
    // コードブロックは読まない（記号列を読み上げても意味が取れない）
    const fence = s.match(/^[ \t]*(```|~~~)/)
    if (inFence) {
      if (fence && fence[1] === fenceMark) inFence = false
      return
    }
    if (fence) {
      inFence = true
      fenceMark = fence[1]
      return
    }
    // 複数行にまたがる HTML コメント
    if (inComment) {
      const at = s.indexOf('-->')
      if (at === -1) return
      s = s.slice(at + 3)
      inComment = false
    }
    s = s.replace(/<!--[\s\S]*?-->/g, '')
    const open = s.indexOf('<!--')
    if (open !== -1) {
      s = s.slice(0, open)
      inComment = true
    }
    // 表の区切り行は空行にせず、行ごと落とす（段落を割らない）
    if (TABLE_SEPARATOR.test(s) && s.indexOf('-') !== -1) return
    // HTML タグ
    s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '')
    // 見出し行は「節」の始まり。目次と同じ区切りで飛べるように印を残す
    const heading = /^[ \t]*#{1,6}[ \t]+\S/.test(s)
    out.push({ text: cleanInline(s), line, heading })
  })
  return out
}

/**
 * Markdown を読み上げ向けの平文にする。構造は改行（段落）だけ残す。
 * @param {string} md
 * @returns {string}
 */
export function markdownToSpeechText(md) {
  return markdownToSpeechLines(md)
    .map(l => l.text)
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 文末。全角の句点・感嘆・疑問と、半角のピリオド等（後ろに空白か行末）
const SENTENCE_END = /([。！？!?]+|\.(?=\s|$))/

function splitSentences(paragraph) {
  const parts = paragraph.split(SENTENCE_END)
  const out = []
  for (let i = 0; i < parts.length; i += 2) {
    const body = (parts[i] || '').trim()
    const end = parts[i + 1] || ''
    const sentence = (body + end).trim()
    if (sentence) out.push(sentence)
  }
  return out
}

// 1 文が長すぎるときは読点で、それでも長ければ長さで切る
function hardSplit(sentence, max) {
  const out = []
  let rest = sentence
  while (rest.length > max) {
    const window = rest.slice(0, max)
    const at = Math.max(window.lastIndexOf('、'), window.lastIndexOf(', '))
    const cut = at > max * 0.4 ? at + 1 : max
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

/**
 * 行の並びを読み上げの塊にする。段落（空行）は跨がない。塊は max 文字以下。
 * @param {Array<{text: string, line: number}>} lines
 * @param {number} [max]
 * 各塊は paragraph（空行で区切った段落の番号）と section（見出しで区切った
 * 節の番号。最初の見出しより前は 0）も持つ。プレーヤーの「段落ごと」「見出し
 * ごと」の移動はこれを使う。
 * @returns {Array<{text: string, startLine: number, endLine: number, paragraph: number, section: number}>}
 */
export function chunkSpeechLines(lines, max = DEFAULT_MAX_CHUNK) {
  const chunks = []
  let cur = null
  let paragraph = 0
  let section = 0
  let paragraphHasText = false
  const flush = () => {
    if (cur && cur.text) chunks.push(cur)
    cur = null
  }
  ;(lines || []).forEach(({ text, line, heading }) => {
    if (!text || !text.trim()) {
      flush()
      if (paragraphHasText) {
        paragraph += 1
        paragraphHasText = false
      }
      return
    }
    if (heading) {
      // 見出しは節の先頭。直前の段落も閉じる
      flush()
      if (paragraphHasText) {
        paragraph += 1
        paragraphHasText = false
      }
      section += 1
    }
    paragraphHasText = true
    const sentences = splitSentences(text)
    if (heading) {
      // 見出しは句点で終わらないので、次の行と繋がないよう単独の塊・段落にする
      cur = {
        text: sentences.join(''),
        startLine: line,
        endLine: line,
        paragraph,
        section
      }
      flush()
      paragraph += 1
      paragraphHasText = false
      return
    }
    sentences.forEach(sentence => {
      const pieces =
        sentence.length > max ? hardSplit(sentence, max) : [sentence]
      pieces.forEach(piece => {
        if (cur && (cur.text + piece).length > max) flush()
        if (!cur) {
          cur = {
            text: piece,
            startLine: line,
            endLine: line,
            paragraph,
            section
          }
        } else {
          cur.text += piece
          cur.endLine = line
        }
      })
    })
  })
  flush()
  return chunks
}

/**
 * 平文を読み上げの塊に分ける。段落は跨がない。塊は max 文字以下。
 * @param {string} text markdownToSpeechText の戻り
 * @param {number} [max]
 * @returns {string[]}
 */
export function splitIntoChunks(text, max) {
  const lines = String(text || '')
    .split('\n')
    .map((t, line) => ({ text: t, line }))
  return chunkSpeechLines(lines, max).map(c => c.text)
}

/**
 * Markdown から読み上げの塊を作る（行番号つき）。プレーヤーはこれを使う。
 * @param {string} md
 * @param {number} [max]
 * @returns {Array<{text: string, startLine: number, endLine: number}>}
 */
export function buildSpeechChunksWithLines(md, max) {
  return chunkSpeechLines(markdownToSpeechLines(md), max)
}

/**
 * Markdown から読み上げの塊（文字列だけ）を作る。
 * @param {string} md
 * @param {number} [max]
 * @returns {string[]}
 */
export function buildSpeechChunks(md, max) {
  return buildSpeechChunksWithLines(md, max).map(c => c.text)
}

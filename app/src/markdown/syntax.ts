import type MarkdownIt from 'markdown-it'
import { full as emoji } from 'markdown-it-emoji'
import footnote from 'markdown-it-footnote'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import abbr from 'markdown-it-abbr'
import deflist from 'markdown-it-deflist'
import kbdModule from 'markdown-it-kbd'
import admonitionModule from 'markdown-it-admonition'
import multimdTableModule from 'markdown-it-multimd-table'

// デスクトップ版（browser/lib/markdown.js）と同じ記法をプレビューで使えるようにする。
// 生の HTML は今まで通り無効で、出力は Preview で DOMPurify を通す

type Plugin = (md: MarkdownIt, options?: unknown) => void

// CJS のパッケージは、Vite（rolldown）と node で default の形が変わる。
// 関数そのものか、{ default: 関数 } のどちらでも取り出す（Preview の KaTeX と同じ事情）
function pluginOf(mod: unknown): Plugin {
  if (typeof mod === 'function') return mod as Plugin
  const inner = (mod as { default?: unknown } | null)?.default
  if (typeof inner === 'function') return inner as Plugin
  throw new Error('markdown-it plugin not found')
}

// デスクトップ版の admonition の種類
export const ADMONITION_TYPES = [
  'note', 'hint', 'attention', 'caution', 'danger', 'error', 'quote', 'abstract', 'question'
]

/** デスクトップ版の slugify（browser/lib/slugify.js）。見出しへのリンクの形を揃える */
export function slugify(title: string): string {
  return encodeURI(
    title
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[\][!'#$%&()*+,./:;<=>?@\\^{|}~`]/g, '')
  )
}

// ![alt](src =100x50) / ![alt](src "title" =100x) の大きさ指定（デスクトップ版の markdown-it-imsize と同じ書き方）。
// パッケージは画像を読んで大きさを測る Node 用の部分ごと読み込まれ、ブラウザで落ちるので、書き方の解釈だけを持つ
const IMAGE_WITH_SIZE = /^!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s+=(\d*)x(\d*)\s*\)/

function imageSize(md: MarkdownIt) {
  md.inline.ruler.before('image', 'image_size', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x21 /* ! */) return false
    const m = IMAGE_WITH_SIZE.exec(state.src.slice(state.pos))
    if (!m) return false
    const href = md.normalizeLink(m[2])
    if (!md.validateLink(href)) return false
    if (!silent) {
      const token = state.push('image', 'img', 0)
      const attrs: [string, string][] = [['src', href], ['alt', '']]
      if (m[3]) attrs.push(['title', m[3]])
      if (m[4]) attrs.push(['width', m[4]])
      if (m[5]) attrs.push(['height', m[5]])
      token.attrs = attrs
      const children: typeof state.tokens = []
      md.inline.parse(m[1], md, state.env, children)
      token.children = children
      token.content = m[1]
    }
    state.pos += m[0].length
    return true
  })
}

/** 先頭の `---` から次の `---` までを front matter として表示しない（デスクトップ版と同じ） */
function frontMatter(md: MarkdownIt) {
  md.block.ruler.before(
    'table',
    'front_matter',
    (state, startLine, _endLine, silent) => {
      if (startLine !== 0 || state.src.slice(state.bMarks[0], state.eMarks[0]) !== '---') return false
      for (let line = 1; line < state.lineMax; line++) {
        if (state.src.slice(state.bMarks[line], state.eMarks[line]) === '---') {
          if (!silent) state.line = line + 1
          return true
        }
      }
      return false
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
  )
}

/** 見出しに id を付け、`[TOC]` だけの段落を見出しの一覧に置き換える */
function headingsAndToc(md: MarkdownIt) {
  md.core.ruler.push('heading_ids_and_toc', state => {
    const tokens = state.tokens
    const used = new Set<string>()
    const headings: { level: number; text: string; id: string }[] = []
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].type !== 'heading_open') continue
      // 絵文字（:smile:）も見出しに出る文字なので含める
      const text = (tokens[i + 1].children ?? [])
        .filter(t => t.type === 'text' || t.type === 'code_inline' || t.type === 'emoji')
        .map(t => t.content)
        .join('')
      const base = slugify(text) || 'section'
      // 「foo」「foo-1」「foo」のように書いても重ならないよう、付けた id 全体を見て番号を決める
      let id = base
      for (let n = 1; used.has(id); n++) id = `${base}-${n}`
      used.add(id)
      tokens[i].attrSet('id', id)
      headings.push({ level: Number(tokens[i].tag.slice(1)), text, id })
    }
    for (let i = 1; i < tokens.length - 1; i++) {
      const inline = tokens[i]
      if (
        inline.type !== 'inline' ||
        tokens[i - 1].type !== 'paragraph_open' ||
        tokens[i - 1].level !== 0 ||
        !/^\[TOC\]$/i.test(inline.content.trim())
      ) {
        continue
      }
      const html = tocHtml(headings, md.utils.escapeHtml)
      const block = new state.Token('html_block', '', 0)
      block.content = html
      tokens.splice(i - 1, 3, block)
    }
  })
}

function tocHtml(
  headings: { level: number; text: string; id: string }[],
  escape: (s: string) => string
): string {
  if (headings.length === 0) return ''
  const top = Math.min(...headings.map(h => h.level))
  let html = '<nav class="toc"><ul>'
  let depth = 0
  headings.forEach((h, idx) => {
    const level = h.level - top
    if (idx > 0) {
      if (level > depth) {
        for (; depth < level; depth++) html += '<ul>'
      } else {
        html += '</li>'
        for (; depth > level; depth--) html += '</ul></li>'
      }
    } else {
      for (; depth < level; depth++) html += '<li><ul>'
    }
    html += `<li><a href="#${escape(h.id)}">${escape(h.text)}</a>`
  })
  html += '</li>'
  for (; depth > 0; depth--) html += '</ul></li>'
  return html + '</ul></nav>'
}

export function desktopSyntaxPlugin(md: MarkdownIt) {
  md.use(frontMatter)
  // デスクトップ版は :) のような顔文字の置き換えをしない
  md.use(pluginOf(emoji), { shortcuts: {} })
  md.use(imageSize)
  md.use(pluginOf(footnote))
  md.use(pluginOf(multimdTableModule))
  md.use(pluginOf(kbdModule))
  md.use(pluginOf(admonitionModule), { types: ADMONITION_TYPES })
  md.use(pluginOf(abbr))
  md.use(pluginOf(sub))
  md.use(pluginOf(sup))
  md.use(pluginOf(deflist))
  md.use(headingsAndToc)
}

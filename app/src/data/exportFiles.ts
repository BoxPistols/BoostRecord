import type { Note, Storage } from '../types'
import { createZip } from './zip.ts'
import { htmlDocument, notesInScope, planExport, zipName } from './exportPlan.ts'
import type { ExportFormat, ExportScope } from './exportPlan.ts'
import { createMarkdown, renderMarkdown } from '../markdown/render'

export interface ExportContext {
  notes: Note[]
  storages: Storage[]
  /** 設定の preview.breaks */
  breaks: boolean
  /** HTML の配色（設定のテーマ。--bg など） */
  theme: Record<string, string>
  /** PDF の配色。暗いテーマのまま印刷すると、背景が落ちて文字が読めなくなる */
  printTheme: Record<string, string>
}

const MIME: Record<Exclude<ExportFormat, 'pdf'>, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html'
}

/**
 * 書き出す。txt・md・html は 1 件ならそのファイル、複数なら zip。
 * pdf は印刷の画面を開く（送り先で「PDF に保存」を選ぶ）。保存先を選ぶのをやめたら false
 */
export async function runExport(scope: ExportScope, format: ExportFormat, ctx: ExportContext): Promise<boolean> {
  if (format === 'pdf') return printNotes(notesInScope(ctx.notes, scope), ctx)
  const items = planExport(ctx.notes, ctx.storages, scope, format)
  if (items.length === 0) throw new Error('書き出すノートがありません')
  let toFile = (note: Note) => note.content
  if (format === 'html') {
    const md = createMarkdown(ctx.breaks)
    const bodies = new Map(items.map(({ note }) => [note.key, renderMarkdown(md, note.content)]))
    // 数式のあるノートがあるときだけ、KaTeX の字形を埋め込む（無ければ数百 KB 軽くなる）
    const withFonts = [...bodies.values()].some(b => b.includes('class="katex'))
    const css = (await collectPreviewCss(withFonts)) + '\n' + pageCss(ctx.theme)
    toFile = note => htmlDocument(note.title, css, bodies.get(note.key)!)
  }
  const encoder = new TextEncoder()
  if (items.length === 1) {
    const { path, note } = items[0]
    return saveFile(new Blob([toFile(note)], { type: MIME[format] }), path)
  }
  const zip = createZip(items.map(({ path, note }) => ({ path, data: encoder.encode(toFile(note)) })))
  return saveFile(new Blob([zip], { type: 'application/zip' }), zipName(scope, ctx.storages, format))
}

/** 保存先を選べるブラウザ（Chrome・Edge）は選んでもらい、選べないブラウザはダウンロードで渡す */
async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  if (typeof window.showSaveFilePicker === 'function') {
    let handle: FileSystemFileHandle
    try {
      handle = await window.showSaveFilePicker({ suggestedName: filename })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false
      throw e
    }
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // クリック直後に消すと、ダウンロードが始まる前に URL が無効になるブラウザがある
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return true
}

function pageCss(theme: Record<string, string>): string {
  const vars = Object.entries(theme)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ')
  return [
    `:root { ${vars} }`,
    "body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', sans-serif; }",
    '.preview { max-width: 900px; margin: 0 auto; padding: 24px; }'
  ].join('\n')
}

// プレビューの見た目に効く規則だけを、今のページの CSS から抜き出す
const KEEP = /\.(?:hljs|katex)|\.preview(?![\w-])|^:root$/

async function collectPreviewCss(withFonts: boolean): Promise<string> {
  const walk = async (rules: CSSRuleList, base: string): Promise<string[]> => {
    const out: string[] = []
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (KEEP.test(rule.selectorText)) out.push(rule.cssText)
      } else if (rule instanceof CSSMediaRule) {
        const inner = await walk(rule.cssRules, base)
        if (inner.length) out.push(`@media ${rule.conditionText} {\n${inner.join('\n')}\n}`)
      } else if (withFonts && rule instanceof CSSFontFaceRule) {
        const face = await inlineKatexFont(rule, base)
        if (face) out.push(face)
      }
    }
    return out
  }
  const out: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // 別のオリジンの CSS は読めない（このアプリには無い）
    }
    out.push(...(await walk(rules, sheet.href ?? location.href)))
  }
  return out.join('\n')
}

/** KaTeX の字形を data: URL にして、ファイル 1 つで数式が崩れないようにする */
async function inlineKatexFont(rule: CSSFontFaceRule, base: string): Promise<string | null> {
  const family = rule.style.getPropertyValue('font-family')
  if (!/KaTeX/.test(family)) return null
  const url = /url\(\s*["']?([^"')]+\.woff2(?:\?[^"')]*)?)["']?\s*\)/.exec(rule.style.getPropertyValue('src'))?.[1]
  if (!url) return null
  const res = await fetch(new URL(url, base))
  if (!res.ok) return null
  const bytes = new Uint8Array(await res.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const weight = rule.style.getPropertyValue('font-weight') || 'normal'
  const style = rule.style.getPropertyValue('font-style') || 'normal'
  return `@font-face { font-family: ${family}; src: url(data:font/woff2;base64,${btoa(bin)}) format("woff2"); font-weight: ${weight}; font-style: ${style}; }`
}

/**
 * 印刷の画面を開く。印刷の間だけアプリを隠し、ノートを並べる（ノートごとに改ページ）。
 * ページ名は PDF の既定のファイル名になるので、ノートの題か範囲の名前にする
 */
async function printNotes(notes: Note[], ctx: ExportContext): Promise<boolean> {
  if (notes.length === 0) throw new Error('書き出すノートがありません')
  const md = createMarkdown(ctx.breaks)
  const root = document.createElement('div')
  root.className = 'print-root'
  for (const [k, v] of Object.entries(ctx.printTheme)) root.style.setProperty(k, v)
  for (const note of notes) {
    const page = document.createElement('div')
    page.className = 'preview'
    page.append(document.createRange().createContextualFragment(renderMarkdown(md, note.content)))
    root.append(page)
  }
  const title = document.title
  document.body.append(root)
  document.documentElement.classList.add('printing')
  document.title = notes.length === 1 ? notes[0].title || 'untitled' : `BoostRecord ${notes.length} 件`
  const done = () => {
    window.removeEventListener('afterprint', done)
    root.remove()
    document.documentElement.classList.remove('printing')
    document.title = title
  }
  window.addEventListener('afterprint', done)
  await document.fonts?.ready
  window.print()
  return true
}

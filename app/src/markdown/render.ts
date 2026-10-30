import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import katexModule from '@vscode/markdown-it-katex'
import { highlightCode } from './highlight'
import { taskListPlugin } from './taskList'
import { desktopSyntaxPlugin } from './syntax'

// このパッケージは CJS で、関数を exports.default に置いている。Vite 8（rolldown）は
// default import に exports オブジェクトそのものを渡すので、そのまま md.use() に渡すと
// "plugin.apply is not a function" でプレビューごと落ちる（Web 版が真っ白になる）。
// どちらの形で来ても関数を取り出す
const katexPlugin = (
  typeof katexModule === 'function'
    ? katexModule
    : (katexModule as unknown as { default: typeof katexModule }).default
) as typeof katexModule

/**
 * プレビューと書き出しで使う Markdown の変換。raw HTML は無効、LaTeX は KaTeX
 * （output: 'html' で、消毒を通る素の span にする）
 */
export function createMarkdown(breaks: boolean): MarkdownIt {
  const m = new MarkdownIt({
    html: false,
    linkify: true,
    // デスクトップ版の preview.smartQuotes（既定で有効）
    typographer: true,
    breaks,
    highlight: highlightCode
  })
  m.use(katexPlugin, { throwOnError: false, output: 'html' })
  m.use(desktopSyntaxPlugin)
  m.use(taskListPlugin)
  return m
}

/** 変換して DOMPurify で消毒した HTML */
export function renderMarkdown(md: MarkdownIt, content: string): string {
  return DOMPurify.sanitize(md.render(content))
}

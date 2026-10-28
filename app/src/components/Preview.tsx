import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import katexModule from '@vscode/markdown-it-katex'
import { highlightCode } from '../markdown/highlight'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

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
 * Markdown preview. Reuses the legacy app's pipeline (markdown-it) but renders
 * safely: raw HTML is disabled, output is sanitized with DOMPurify and injected
 * via a parsed fragment + replaceChildren (no innerHTML). LaTeX math ($…$ and
 * $$…$$) is rendered with KaTeX (output: 'html' so the markup is plain spans
 * that survive sanitization); a sanitize test guards against regressions.
 */
export function Preview({
  content,
  rootRef
}: {
  content: string
  /** ノート内検索がプレビューの文字を探すのに使う */
  rootRef?: RefObject<HTMLDivElement | null>
}) {
  const own = useRef<HTMLDivElement>(null)
  const host = rootRef ?? own
  const md = useMemo(() => {
    const m = new MarkdownIt({
      html: false,
      linkify: true,
      breaks: true,
      highlight: highlightCode
    })
    m.use(katexPlugin, { throwOnError: false, output: 'html' })
    return m
  }, [])

  useEffect(() => {
    if (!host.current) return
    const clean = DOMPurify.sanitize(md.render(content))
    const frag = document.createRange().createContextualFragment(clean)
    host.current.replaceChildren(frag)
  }, [content, md, host])

  return <div ref={host} className="pane preview" />
}

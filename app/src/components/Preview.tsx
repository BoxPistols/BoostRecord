import { useEffect, useMemo, useRef } from 'react'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import katexPlugin from '@vscode/markdown-it-katex'
import { highlightCode } from '../markdown/highlight'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

/**
 * Markdown preview. Reuses the legacy app's pipeline (markdown-it) but renders
 * safely: raw HTML is disabled, output is sanitized with DOMPurify and injected
 * via a parsed fragment + replaceChildren (no innerHTML). LaTeX math ($…$ and
 * $$…$$) is rendered with KaTeX (output: 'html' so the markup is plain spans
 * that survive sanitization); a sanitize test guards against regressions.
 */
export function Preview({ content }: { content: string }) {
  const host = useRef<HTMLDivElement>(null)
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
  }, [content, md])

  return <div ref={host} className="pane preview" />
}

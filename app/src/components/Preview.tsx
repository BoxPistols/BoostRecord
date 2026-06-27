import { useEffect, useMemo, useRef } from 'react'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/**
 * Markdown preview. Reuses the legacy app's pipeline (markdown-it) but renders
 * safely: raw HTML is disabled, output is sanitized with DOMPurify and injected
 * via a parsed fragment + replaceChildren (no innerHTML). KaTeX/mermaid plug in
 * here later as markdown-it plugins.
 */
export function Preview({ content }: { content: string }) {
  const host = useRef<HTMLDivElement>(null)
  const md = useMemo(
    () => new MarkdownIt({ html: false, linkify: true, breaks: true }),
    []
  )

  useEffect(() => {
    if (!host.current) return
    const clean = DOMPurify.sanitize(md.render(content))
    const frag = document.createRange().createContextualFragment(clean)
    host.current.replaceChildren(frag)
  }, [content, md])

  return <div ref={host} className="pane preview" />
}

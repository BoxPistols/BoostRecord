import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { createMarkdown, renderMarkdown } from '../markdown/render'
import { noteKeyFromLink } from '../noteUrl'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

/**
 * Markdown preview. Reuses the legacy app's pipeline (markdown-it) but renders
 * safely: raw HTML is disabled, output is sanitized with DOMPurify and injected
 * via a parsed fragment + replaceChildren (no innerHTML). LaTeX math ($…$ and
 * $$…$$) is rendered with KaTeX (output: 'html' so the markup is plain spans
 * that survive sanitization); a sanitize test guards against regressions.
 */
export function Preview({
  content,
  rootRef,
  breaks = true,
  onToggleTask,
  onOpenNote
}: {
  content: string
  /** チェックボックスを押したとき。引数は元の Markdown の行番号（0 始まり） */
  onToggleTask?: (line: number) => void
  /** `[題](:note:キー)` のリンクを押したとき（デスクトップ版の「Copy Note Link」で作るリンク） */
  onOpenNote?: (key: string) => void
  /** Markdown 中の改行でプレビューも改行する（設定。デスクトップ版の preview.breaks） */
  breaks?: boolean
  /** ノート内検索がプレビューの文字を探すのに使う */
  rootRef?: RefObject<HTMLDivElement | null>
}) {
  const own = useRef<HTMLDivElement>(null)
  const host = rootRef ?? own
  const md = useMemo(() => createMarkdown(breaks), [breaks])

  useEffect(() => {
    if (!host.current) return
    const clean = renderMarkdown(md, content)
    const frag = document.createRange().createContextualFragment(clean)
    host.current.replaceChildren(frag)
  }, [content, md, host])

  return (
    <div
      ref={host}
      className="pane preview"
      onClick={e => {
        const target = e.target
        if (!(target instanceof Element)) return
        // ほかのノートへのリンク。そのままだとページの相対 URL として開いてしまう
        const noteAnchor = target.closest('a[href^=":note:"]')
        if (noteAnchor) {
          e.preventDefault()
          const key = noteKeyFromLink(noteAnchor.getAttribute('href')!)
          if (key) onOpenNote?.(key)
          return
        }
        // 脚注や目次のページ内リンクは、アドレスを変えずにプレビューの中だけを動かす
        const link = target.closest('a[href^="#"]')
        if (link && host.current) {
          e.preventDefault()
          const id = link.getAttribute('href')!.slice(1)
          const ids = [...host.current.querySelectorAll('[id]')]
          // 見出しの ID はデスクトップ版と同じく大文字を残す。GitHub のように小文字で書いたリンクでも飛べるよう、
          // 同じものが無いときだけ大文字と小文字を区別せずに探す
          const dest =
            ids.find(el => el.id === id) ?? ids.find(el => el.id.toLowerCase() === id.toLowerCase())
          dest?.scrollIntoView({ block: 'start' })
          return
        }
        const label = target.closest('label.task-label')
        const box = label?.querySelector('input.task-checkbox')
        if (!box) return
        // 表示は Markdown を書き換えた結果で描き直す。ここで切り替わらないように止める
        e.preventDefault()
        const line = Number(box.getAttribute('data-line'))
        if (onToggleTask && Number.isInteger(line)) onToggleTask(line)
      }}
    />
  )
}

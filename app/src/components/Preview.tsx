import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createMarkdown, renderMarkdown } from '../markdown/render'
import { noteKeyFromLegacyLink, noteKeyFromLink } from '../noteUrl'
import { attachmentPath, attachmentUrlKind, isAttachmentRef } from '../data/attachments'
import { markImageRows } from '../markdown/imageRows'
import { ImageLightbox, type LightboxImage } from './ImageLightbox'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

/**
 * Markdown preview. Reuses the legacy app's pipeline (markdown-it) but renders
 * safely: raw HTML is disabled, output is sanitized with DOMPurify, parsed in an
 * inert document (DOMParser) and moved in with replaceChildren (no innerHTML). LaTeX math ($…$ and
 * $$…$$) is rendered with KaTeX (output: 'html' so the markup is plain spans
 * that survive sanitization); a sanitize test guards against regressions.
 */
export function Preview({
  content,
  rootRef,
  breaks = true,
  onToggleTask,
  onOpenNote,
  readAttachment
}: {
  content: string
  /**
   * 添付ファイル（`:storage/ノートのキー/ファイル名`）を読む。読めるストレージのときだけ渡す。
   * ストレージが変わったら別の関数を渡すこと（読んだものを捨てて読み直す）
   */
  readAttachment?: (path: string[]) => Promise<Blob>
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
  // 読んだ添付の blob: URL。入力のたびに描き直すので、同じファイルは読み直さない
  const urls = useRef(new Map<string, Promise<string | null>>())
  // 開いたときの本文と読み先も持ち、ノートが変わったら閉じる（前のノートの画像や解放した URL を見せない）
  const [lightbox, setLightbox] = useState<{
    images: LightboxImage[]
    index: number
    content: string
    readAttachment: typeof readAttachment
  } | null>(null)
  // 同じノートへ戻ったときに、解放済みの URL で開き直さないよう、隠すだけでなく閉じる
  if (lightbox && (lightbox.content !== content || lightbox.readAttachment !== readAttachment)) setLightbox(null)

  // ストレージが変わったら（関数が変わったら）、作った URL を捨てる
  useEffect(() => {
    const cache = urls.current
    return () => {
      for (const p of cache.values()) p.then(u => u?.startsWith('blob:') && URL.revokeObjectURL(u))
      cache.clear()
    }
  }, [readAttachment])

  useEffect(() => {
    if (!host.current) return
    const clean = renderMarkdown(md, content)
    // 何も読み込まない文書（DOMParser）で組み立て、:storage の参照を外してからページへ移す。
    // このページの文書で要素を作る createContextualFragment では、Safari などが作った時点で画像を
    // 取りに行き、外す前の /:storage/... をこのサイトへ問い合わせてしまう
    const parsed = new DOMParser().parseFromString(clean, 'text/html').body
    const pending = takeAttachments(parsed)
    // 本文から外れた添付の URL を解放する。Preview はノートを替えても残るので、放っておくと Blob が溜まる
    const keep = new Set(pending.map(({ el, path }) => cacheKeyOf(el, path)))
    for (const [key, p] of urls.current) {
      if (keep.has(key)) continue
      urls.current.delete(key)
      p.then(u => u?.startsWith('blob:') && URL.revokeObjectURL(u))
    }
    markImageRows(parsed)
    host.current.replaceChildren(...parsed.childNodes)
    for (const { el, path } of pending) {
      const id = path.join('/')
      const purpose = el instanceof HTMLImageElement ? 'image' : 'file'
      const cacheKey = cacheKeyOf(el, path)
      let url = urls.current.get(cacheKey)
      if (!url) {
        url = readAttachment
          ? readAttachment(path)
              // URL を作るところ（SVG の読み込みなど）で失敗しても、読めなかった添付として扱う
              .then(blob => attachmentUrl(blob, path[path.length - 1], purpose))
              .catch(() => null)
          : Promise.resolve(null)
        urls.current.set(cacheKey, url)
      }
      url.then(u => {
        // 読めなかったものは覚えない。あとから置いたファイルも次の描き直しで出る
        if (!u && urls.current.get(cacheKey) === url) urls.current.delete(cacheKey)
        // 読み終わる前に描き直したら、古い要素には付けない
        if (!el.isConnected) return
        if (!u) {
          el.classList.add('attachment-missing')
          el.setAttribute('title', `添付ファイルを開けません: ${id}`)
        } else if (el instanceof HTMLImageElement) {
          el.src = u
        } else {
          // 新しいタブでは開かずに保存する。SVG などをこのサイトの中で開かせない
          el.setAttribute('href', u)
          el.setAttribute('download', path[path.length - 1])
        }
      })
    }
  }, [content, md, host, readAttachment])

  return (
    <>
    <div
      ref={host}
      className="pane preview"
      onClick={e => {
        const target = e.target
        if (!(target instanceof Element)) return
        // 画像を押すと拡大する（デスクトップ版と同じ）。リンクの中の画像はリンクとして開く
        if (target instanceof HTMLImageElement && host.current) {
          const images = zoomableImages(host.current)
          const index = images.indexOf(target)
          if (index >= 0) {
            setLightbox({
              images: images.map(img => ({ src: img.currentSrc || img.src, alt: img.alt })),
              index,
              content,
              readAttachment
            })
            return
          }
        }
        // ほかのノートへのリンク。そのままだとページの相対 URL として開いてしまう
        const anchor = target.closest('a[href]')
        const href = anchor?.getAttribute('href') ?? ''
        const noteKey = noteKeyFromLink(href) ?? (href.startsWith('#') ? null : noteKeyFromLegacyLink(href))
        if (anchor && (href.startsWith(':note:') || noteKey)) {
          e.preventDefault()
          if (noteKey) onOpenNote?.(noteKey)
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
          if (dest) dest.scrollIntoView({ block: 'start' })
          else {
            // ページ内に無ければ、旧 Boostnote のノートへのリンク（#ストレージキー-ノートキー）かもしれない
            const legacy = noteKeyFromLegacyLink(link.getAttribute('href')!)
            if (legacy) onOpenNote?.(legacy)
          }
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
    {lightbox && (
      <ImageLightbox images={lightbox.images} start={lightbox.index} onClose={() => setLightbox(null)} />
    )}
    </>
  )
}

/** 添付を指す img と a から参照を外し、あとで差し込む先として返す */
function takeAttachments(root: ParentNode) {
  const out: { el: HTMLElement; path: string[] }[] = []
  for (const el of root.querySelectorAll<HTMLElement>('img[src], a[href]')) {
    const attr = el instanceof HTMLImageElement ? 'src' : 'href'
    const ref = el.getAttribute(attr) ?? ''
    const path = attachmentPath(ref)
    if (!path) {
      // 添付の書き方なのにストレージの外を指すものは、元の参照のままだとこのサイトへ問い合わせてしまう
      if (isAttachmentRef(ref)) {
        el.removeAttribute(attr)
        el.classList.add('attachment', 'attachment-missing')
        el.setAttribute('title', '添付ファイルを開けません')
      }
      continue
    }
    el.removeAttribute(attr)
    el.classList.add('attachment')
    out.push({ el, path })
  }
  return out
}

/** 添付の URL のキャッシュのキー。同じファイルでも、画像として出すときと保存させるときで URL の作り方が違う */
function cacheKeyOf(el: HTMLElement, path: string[]) {
  return `${el instanceof HTMLImageElement ? 'image' : 'file'}:${path.join('/')}`
}

/** 拡大できる画像（読み込めたもの。リンクの中のものは除く）を並び順で */
function zoomableImages(root: HTMLElement) {
  return Array.from(root.querySelectorAll('img')).filter(img => img.naturalWidth > 0 && !img.closest('a[href]'))
}

/** 読んだ添付を、種類に合わせた URL にする（attachmentUrlKind を参照） */
async function attachmentUrl(blob: Blob, name: string, purpose: 'image' | 'file'): Promise<string> {
  const how = attachmentUrlKind(name, purpose)
  if (how.kind === 'svg') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(new Blob([blob], { type: 'image/svg+xml' }))
    })
  }
  const type = how.kind === 'raster' ? how.type : 'application/octet-stream'
  return URL.createObjectURL(new Blob([blob], { type }))
}

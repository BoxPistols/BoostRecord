import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export interface LightboxImage {
  src: string
  alt: string
}

/** 端で止める（ループしない）。デスクトップ版の stepIndex と同じ */
const stepIndex = (index: number, delta: number, length: number) =>
  Math.min(Math.max(index + delta, 0), length - 1)

/**
 * プレビューの画像を拡大して見せ、同じノートの画像を左右に送る。デスクトップ版の
 * imageLightbox と同じ操作（← → で送る、Esc・背景・閉じるで閉じる、下のサムネイルで選ぶ）。
 * 画像の文字の読み取りは AI を使うので、Web 版には置かない。
 * 詳細の領域はコンテナクエリで包んでいて、その中では position: fixed が画面に固定されないので body に出す
 */
export function ImageLightbox({
  images,
  start,
  onClose
}: {
  images: LightboxImage[]
  start: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(start)
  const root = useRef<HTMLDivElement>(null)
  const thumbs = useRef<(HTMLButtonElement | null)[]>([])
  const pressedOnBackdrop = useRef(false)
  const close = useRef(onClose)
  close.current = onClose
  const multiple = images.length > 1
  const current = images[index]

  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null
    root.current?.focus()
    // エディタやアプリのショートカットより先に取る
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
      const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
      if (!delta && e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      if (delta) setIndex(i => stepIndex(i, delta, images.length))
      else close.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      // 開く前に触っていたところ（エディタなど）へ戻す
      back?.focus({ preventScroll: true })
    }
  }, [images.length])

  useEffect(() => {
    thumbs.current[index]?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [index])

  // 背景で押して背景で離したときだけ閉じる。画像やボタンの上では閉じない
  const isBackdrop = (el: EventTarget) => el instanceof HTMLElement && el.dataset.backdrop !== undefined

  return createPortal(
    <div
      ref={root}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="画像の拡大表示"
      tabIndex={-1}
      data-backdrop=""
      onMouseDown={e => {
        pressedOnBackdrop.current = isBackdrop(e.target)
      }}
      onClick={e => {
        if (pressedOnBackdrop.current && isBackdrop(e.target)) onClose()
        pressedOnBackdrop.current = false
      }}
    >
      <div className="lightbox-bar" data-backdrop="">
        <span className="lightbox-counter" aria-live="polite">
          {multiple ? `${index + 1} / ${images.length}` : ''}
        </span>
        <button className="lightbox-button" onClick={onClose} title="閉じる（Esc）" aria-label="閉じる">
          <X size={20} aria-hidden />
        </button>
      </div>
      <div className="lightbox-stage" data-backdrop="">
        <img className="lightbox-image" src={current.src} alt={current.alt} />
        {multiple && index > 0 && (
          <button
            className="lightbox-button lightbox-prev"
            onClick={() => setIndex(i => stepIndex(i, -1, images.length))}
            title="前の画像（←）"
            aria-label="前の画像"
          >
            <ChevronLeft size={24} aria-hidden />
          </button>
        )}
        {multiple && index < images.length - 1 && (
          <button
            className="lightbox-button lightbox-next"
            onClick={() => setIndex(i => stepIndex(i, 1, images.length))}
            title="次の画像（→）"
            aria-label="次の画像"
          >
            <ChevronRight size={24} aria-hidden />
          </button>
        )}
      </div>
      {multiple && (
        <div className="lightbox-thumbs">
          {images.map((img, i) => (
            <button
              key={i}
              ref={el => {
                thumbs.current[i] = el
              }}
              className="lightbox-thumb"
              aria-label={`${i + 1} / ${images.length}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
            >
              <img src={img.src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}

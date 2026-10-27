import { useRef } from 'react'

interface Props {
  /** ドラッグ中、ポインタの x 座標（clientX）を渡す */
  onDrag: (clientX: number) => void
  /** 離したとき */
  onEnd?: () => void
  label: string
}

/**
 * 縦の境界線。見た目は 1px の線で、つかめる幅は左右に 3px ずつ広げてある
 * （デスクトップ版の slider-hitbox と同じ 7px）。
 * setPointerCapture でポインタを捕まえるので、プレビューやエディタの上を
 * 通っても途切れない
 */
export function Splitter({ onDrag, onEnd, label }: Props) {
  const dragging = useRef(false)
  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      onPointerDown={e => {
        if (e.button !== 0) return
        e.preventDefault()
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        document.body.classList.add('is-resizing')
      }}
      onPointerMove={e => {
        if (dragging.current) onDrag(e.clientX)
      }}
      onPointerUp={e => {
        if (!dragging.current) return
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
        document.body.classList.remove('is-resizing')
        onEnd?.()
      }}
      onPointerCancel={() => {
        dragging.current = false
        document.body.classList.remove('is-resizing')
        onEnd?.()
      }}
    />
  )
}

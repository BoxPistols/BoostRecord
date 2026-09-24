/**
 * @fileoverview プレビュー内の画像を拡大表示し、同じノートの画像を左右に送るライトボックス。
 * 素のDOMだけで組む（Electron依存なし）。オーバーレイは親ウィンドウのdocumentに置き、
 * プレビューiframe内の画像の位置はiframeの矩形を足して親の座標に直す。
 */

export const OVERLAY_ID = 'imageLightbox'
export const STYLE_ID = 'imageLightboxStyle'

const ANIMATION_MS = 240

const LIGHTBOX_CSS = `
#${OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  grid-template-rows: 56px minmax(0, 1fr) auto;
  background-color: rgba(14, 15, 18, 0.86);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: rgba(255, 255, 255, 0.92);
  cursor: zoom-out;
  outline: none;
  user-select: none;
}
#${OVERLAY_ID} .imageLightbox-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 20px;
}
#${OVERLAY_ID} .imageLightbox-counter {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.72);
}
#${OVERLAY_ID} .imageLightbox-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 76px 16px;
  min-height: 0;
}
#${OVERLAY_ID} .imageLightbox-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: 0 0;
  cursor: default;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
}
#${OVERLAY_ID} .imageLightbox-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.08);
  color: inherit;
  cursor: pointer;
  transition: background-color 0.15s;
}
#${OVERLAY_ID} .imageLightbox-button:hover {
  background-color: rgba(255, 255, 255, 0.18);
}
#${OVERLAY_ID} .imageLightbox-button:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.9);
  outline-offset: 2px;
}
#${OVERLAY_ID} .imageLightbox-button[hidden] {
  display: none;
}
#${OVERLAY_ID} .imageLightbox-prev,
#${OVERLAY_ID} .imageLightbox-next {
  position: absolute;
  top: 50%;
  margin-top: -30px;
}
#${OVERLAY_ID} .imageLightbox-prev { left: 16px; }
#${OVERLAY_ID} .imageLightbox-next { right: 16px; }
#${OVERLAY_ID} .imageLightbox-thumbs {
  display: flex;
  gap: 8px;
  justify-content: safe center;
  overflow-x: auto;
  padding: 12px 16px 16px;
  background-color: rgba(0, 0, 0, 0.28);
  scrollbar-width: thin;
}
#${OVERLAY_ID} .imageLightbox-thumb {
  flex: 0 0 auto;
  width: 72px;
  height: 52px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 0.15s;
}
#${OVERLAY_ID} .imageLightbox-thumb:hover { opacity: 0.8; }
#${OVERLAY_ID} .imageLightbox-thumb[aria-current='true'] {
  opacity: 1;
  outline: 2px solid rgba(255, 255, 255, 0.9);
  outline-offset: 2px;
}
#${OVERLAY_ID} .imageLightbox-thumb:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.9);
  outline-offset: 2px;
}
#${OVERLAY_ID} .imageLightbox-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
}
`

const ICON_PREV =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
const ICON_NEXT =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
const ICON_CLOSE =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'

/**
 * 端で止める（ループしない）。先頭・末尾では該当の矢印を隠す
 * @param {number} index
 * @param {number} delta
 * @param {number} length
 * @returns {number}
 */
export function stepIndex(index, delta, length) {
  return Math.min(Math.max(index + delta, 0), length - 1)
}

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = LIGHTBOX_CSS
  doc.head.appendChild(style)
}

function createButton(doc, className, label, icon) {
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = `imageLightbox-button ${className}`
  button.setAttribute('aria-label', label)
  button.title = label
  button.innerHTML = icon
  return button
}

function prefersReducedMotion(win) {
  return (
    typeof win.matchMedia === 'function' &&
    win.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// iframe内の画像を親ウィンドウの座標に直す。画面外ならnull
function sourceRect(img, frameRect, win) {
  const r = img.getBoundingClientRect()
  const rect = {
    top: r.top + frameRect.top,
    left: r.left + frameRect.left,
    width: r.width,
    height: r.height
  }
  const visible =
    rect.width > 0 &&
    rect.top + rect.height > 0 &&
    rect.top < win.innerHeight &&
    rect.left + rect.width > 0 &&
    rect.left < win.innerWidth
  return visible ? rect : null
}

// fromの矩形からtoの矩形へtransformで寄せる（縦横比は同じなので一様拡大で足りる）
function transformBetween(from, to) {
  const scale = from.width / to.width
  const dx = from.left - to.left
  const dy = from.top - to.top
  return `translate(${dx}px, ${dy}px) scale(${scale})`
}

/**
 * ライトボックスを開く
 * @param {Object} options
 * @param {HTMLImageElement[]} options.images 送り対象の画像（プレビュー内の並び順）
 * @param {number} options.index 最初に表示する画像の位置
 * @param {Element} options.frame プレビューのiframe（座標の換算に使う）
 * @param {Object} options.labels { previous, next, close }
 * @param {Document} [options.doc] オーバーレイを置くdocument
 * @returns {Function} 閉じる関数
 */
export function openImageLightbox(options) {
  const { images, frame, labels } = options
  const doc = options.doc || document
  const win = doc.defaultView
  const animate = !prefersReducedMotion(win)
  let index = options.index
  let closing = false

  const existing = doc.getElementById(OVERLAY_ID)
  if (existing) existing.remove()
  ensureStyle(doc)

  const overlay = doc.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.tabIndex = -1
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')

  const bar = doc.createElement('div')
  bar.className = 'imageLightbox-bar'
  const counter = doc.createElement('div')
  counter.className = 'imageLightbox-counter'
  const closeButton = createButton(
    doc,
    'imageLightbox-close',
    labels.close,
    ICON_CLOSE
  )
  bar.appendChild(counter)
  bar.appendChild(closeButton)

  const stage = doc.createElement('div')
  stage.className = 'imageLightbox-stage'
  const view = doc.createElement('img')
  view.className = 'imageLightbox-image'
  view.alt = ''
  const prevButton = createButton(
    doc,
    'imageLightbox-prev',
    labels.previous,
    ICON_PREV
  )
  const nextButton = createButton(
    doc,
    'imageLightbox-next',
    labels.next,
    ICON_NEXT
  )
  stage.appendChild(view)
  stage.appendChild(prevButton)
  stage.appendChild(nextButton)

  overlay.appendChild(bar)
  overlay.appendChild(stage)

  // 1枚だけのときは送りの操作を出さない
  const multiple = images.length > 1
  const thumbs = []
  if (multiple) {
    const strip = doc.createElement('div')
    strip.className = 'imageLightbox-thumbs'
    images.forEach((img, i) => {
      const thumb = doc.createElement('button')
      thumb.type = 'button'
      thumb.className = 'imageLightbox-thumb'
      thumb.setAttribute('aria-label', `${i + 1} / ${images.length}`)
      const thumbImg = doc.createElement('img')
      thumbImg.src = img.src
      thumbImg.alt = ''
      thumbImg.loading = 'lazy'
      thumb.appendChild(thumbImg)
      thumb.addEventListener('click', e => {
        e.stopPropagation()
        show(i)
      })
      strip.appendChild(thumb)
      thumbs.push(thumb)
    })
    // サムネイルを押し損ねた隙間のクリックで閉じない
    strip.addEventListener('click', e => e.stopPropagation())
    overlay.appendChild(strip)
  }

  function show(next) {
    index = next
    const img = images[index]
    view.src = img.src
    view.alt = img.alt || ''
    counter.textContent = multiple ? `${index + 1} / ${images.length}` : ''
    prevButton.hidden = !multiple || index === 0
    nextButton.hidden = !multiple || index === images.length - 1
    thumbs.forEach((thumb, i) => {
      thumb.setAttribute('aria-current', i === index ? 'true' : 'false')
    })
    if (thumbs[index]) {
      thumbs[index].scrollIntoView({ block: 'nearest', inline: 'center' })
    }
  }

  function step(delta) {
    const next = stepIndex(index, delta, images.length)
    if (next !== index) show(next)
  }

  function close() {
    if (closing) return
    closing = true
    win.removeEventListener('keydown', handleKeyDown, true)
    const from = view.getBoundingClientRect()
    const to = sourceRect(images[index], frame.getBoundingClientRect(), win)
    if (!animate || !to || from.width === 0) {
      overlay.remove()
      return
    }
    view.animate(
      [{ transform: 'none' }, { transform: transformBetween(to, from) }],
      { duration: ANIMATION_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
    )
    const fade = overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: ANIMATION_MS
    })
    fade.onfinish = () => overlay.remove()
  }

  // 親ウィンドウのショートカットより先に取るためcaptureで聞き、処理したキーは止める
  function handleKeyDown(e) {
    const actions = {
      ArrowLeft: () => step(-1),
      ArrowRight: () => step(1),
      Escape: close
    }
    const action = actions[e.key]
    if (!action) return
    e.preventDefault()
    e.stopPropagation()
    action()
  }

  prevButton.addEventListener('click', e => {
    e.stopPropagation()
    step(-1)
  })
  nextButton.addEventListener('click', e => {
    e.stopPropagation()
    step(1)
  })
  closeButton.addEventListener('click', e => {
    e.stopPropagation()
    close()
  })
  // 画像そのもののクリックでは閉じない（背景・×・Escで閉じる）
  view.addEventListener('click', e => e.stopPropagation())
  overlay.addEventListener('click', close)
  win.addEventListener('keydown', handleKeyDown, true)

  // 切り離されたノードではscrollIntoViewが効かないので、追加してから表示する
  doc.body.appendChild(overlay)
  show(index)
  overlay.focus()

  // 開くときだけ、元の位置から拡大して見せる。寸法が決まるのは読み込み後
  const zoomIn = () => {
    const from = sourceRect(images[index], frame.getBoundingClientRect(), win)
    const to = view.getBoundingClientRect()
    if (!from || to.width === 0) return
    view.animate(
      [{ transform: transformBetween(from, to) }, { transform: 'none' }],
      { duration: ANIMATION_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    )
  }
  if (animate) {
    if (view.complete && view.naturalWidth > 0) zoomIn()
    else view.addEventListener('load', zoomIn, { once: true })
  }

  return close
}

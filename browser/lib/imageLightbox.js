/**
 * @fileoverview プレビュー内の画像を拡大表示し、同じノートの画像を左右に送るライトボックス。
 * 素のDOMだけで組む（Electron依存なし）。オーバーレイは親ウィンドウのdocumentに置き、
 * プレビューiframe内の画像の位置はiframeの矩形を足して親の座標に直す。
 */

export const OVERLAY_ID = 'imageLightbox'
export const STYLE_ID = 'imageLightboxStyle'

const ANIMATION_MS = 240

// 開いているライトボックスの閉じる関数。同時に開けるのは1つだけ
let activeClose = null

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
#${OVERLAY_ID} .imageLightbox-body {
  display: flex;
  min-height: 0;
}
#${OVERLAY_ID} .imageLightbox-stage {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 76px 16px;
  min-height: 0;
}
#${OVERLAY_ID} .imageLightbox-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}
#${OVERLAY_ID} .imageLightbox-textButton {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 18px;
  background-color: rgba(255, 255, 255, 0.08);
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s;
}
#${OVERLAY_ID} .imageLightbox-textButton:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.18);
}
#${OVERLAY_ID} .imageLightbox-textButton:disabled {
  opacity: 0.5;
  cursor: default;
}
#${OVERLAY_ID} .imageLightbox-textButton[aria-pressed='true'],
#${OVERLAY_ID} .imageLightbox-textButton[aria-pressed='true']:hover {
  background-color: rgba(255, 255, 255, 0.9);
  color: #111318;
}
#${OVERLAY_ID} .imageLightbox-textButton:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.9);
  outline-offset: 2px;
}
#${OVERLAY_ID} .imageLightbox-ocr {
  flex: 0 0 360px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  margin: 0 16px 16px 0;
  padding: 16px;
  border-radius: 8px;
  background-color: rgba(30, 32, 38, 0.88);
  cursor: default;
}
#${OVERLAY_ID} .imageLightbox-ocr[hidden] {
  display: none;
}
#${OVERLAY_ID} .imageLightbox-ocrTitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
#${OVERLAY_ID} .imageLightbox-engines {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 20px;
  background-color: rgba(0, 0, 0, 0.3);
}
#${OVERLAY_ID} .imageLightbox-engines .imageLightbox-textButton {
  flex: 1 1 0;
  height: 30px;
  padding: 0 8px;
  background-color: transparent;
  font-size: 12px;
}
#${OVERLAY_ID} .imageLightbox-engines .imageLightbox-textButton[aria-pressed='true'] {
  background-color: rgba(255, 255, 255, 0.9);
}
#${OVERLAY_ID} .imageLightbox-ocrStatus {
  min-height: 18px;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.72);
}
#${OVERLAY_ID} .imageLightbox-ocrStatus[data-error='true'] {
  color: #ff9d8a;
}
#${OVERLAY_ID} .imageLightbox-ocrUsage {
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.6);
}
#${OVERLAY_ID} .imageLightbox-ocrUsage:empty {
  display: none;
}
#${OVERLAY_ID} .imageLightbox-ocrText {
  flex: 1 1 auto;
  min-height: 120px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background-color: rgba(0, 0, 0, 0.35);
  color: inherit;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  user-select: text;
}
#${OVERLAY_ID} .imageLightbox-ocrText:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.5);
}
#${OVERLAY_ID} .imageLightbox-ocrActions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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

// iframe内の画像を親ウィンドウの座標に直す。iframeの表示範囲か画面の外ならnull
// （プレビューをスクロールして隠れた画像へ、閉じるアニメーションを向けない）
function sourceRect(img, frameRect, win) {
  const r = img.getBoundingClientRect()
  const rect = {
    top: r.top + frameRect.top,
    left: r.left + frameRect.left,
    width: r.width,
    height: r.height
  }
  const top = Math.max(frameRect.top, 0)
  const left = Math.max(frameRect.left, 0)
  const bottom = Math.min(frameRect.top + frameRect.height, win.innerHeight)
  const right = Math.min(frameRect.left + frameRect.width, win.innerWidth)
  const visible =
    rect.width > 0 &&
    rect.top + rect.height > top &&
    rect.top < bottom &&
    rect.left + rect.width > left &&
    rect.left < right
  return visible ? rect : null
}

// fromの矩形からtoの矩形へtransformで寄せる（縦横比は同じなので一様拡大で足りる）
function transformBetween(from, to) {
  const scale = from.width / to.width
  const dx = from.left - to.left
  const dy = from.top - to.top
  return `translate(${dx}px, ${dy}px) scale(${scale})`
}

function isEditable(el) {
  if (!el || !el.tagName) return false
  const tag = el.tagName.toLowerCase()
  return (
    tag === 'textarea' ||
    tag === 'input' ||
    tag === 'select' ||
    el.isContentEditable === true
  )
}

function createTextButton(doc, label, className) {
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = `imageLightbox-textButton${
    className ? ` ${className}` : ''
  }`
  button.textContent = label
  return button
}

/**
 * 画像の文字を読み取るパネル。読み取りは利用者が押したときだけ行い、送り操作では走らせない
 * （外部に送る方式のとき、見ていない画像まで送らないため）
 */
function createOcrPanel(doc, ocr, images, currentIndex) {
  const labels = ocr.labels
  let engine = ocr.engine
  let open = false
  // 画像の位置と方式ごとに結果を持つ。前の画像に戻ったときに読み直さない
  const results = new Map()
  const keyOf = i => `${i}:${engine}`
  // 画像ごとに、最後にノートへ入れた文章。方式を変えて入れ直したときは置き換え、元に戻すときは消す
  const inserted = new Map()

  const toggle = createTextButton(doc, labels.extract)
  toggle.setAttribute('aria-pressed', 'false')

  const panel = doc.createElement('section')
  panel.className = 'imageLightbox-ocr'
  panel.hidden = true
  panel.setAttribute('aria-label', labels.title)
  // パネル内のクリックで背景のクリック（閉じる）に届かせない
  panel.addEventListener('click', e => e.stopPropagation())

  const title = doc.createElement('h2')
  title.className = 'imageLightbox-ocrTitle'
  title.textContent = labels.title
  panel.appendChild(title)

  const engineButtons = []
  if (ocr.engines.length > 1) {
    const group = doc.createElement('div')
    group.className = 'imageLightbox-engines'
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', labels.engine)
    ocr.engines.forEach(item => {
      const button = createTextButton(doc, item.label)
      button.addEventListener('click', () => {
        if (engine === item.id) return
        engine = item.id
        if (ocr.onEngineChange) ocr.onEngineChange(engine)
        render()
      })
      engineButtons.push({ id: item.id, button })
      group.appendChild(button)
    })
    panel.appendChild(group)
  }

  const status = doc.createElement('div')
  status.className = 'imageLightbox-ocrStatus'
  status.setAttribute('role', 'status')
  const text = doc.createElement('textarea')
  text.className = 'imageLightbox-ocrText'
  text.setAttribute('aria-label', labels.title)
  text.spellcheck = false
  // 手で直した内容を、その画像の結果として持っておく
  text.addEventListener('input', () => {
    const entry = results.get(keyOf(currentIndex()))
    if (entry) entry.text = text.value
    render()
  })

  const actions = doc.createElement('div')
  actions.className = 'imageLightbox-ocrActions'
  const runButton = createTextButton(doc, labels.run)
  const copyButton = createTextButton(doc, labels.copy)
  const insertButton = ocr.insert ? createTextButton(doc, labels.insert) : null
  actions.appendChild(runButton)
  actions.appendChild(copyButton)
  if (insertButton) actions.appendChild(insertButton)
  const undoButton =
    ocr.insert && ocr.remove ? createTextButton(doc, labels.undo) : null
  if (undoButton) actions.appendChild(undoButton)

  // 使用量と料金の概算。端末内の読み取りでは空になり、表示されない
  const usage = doc.createElement('div')
  usage.className = 'imageLightbox-ocrUsage'

  panel.appendChild(status)
  panel.appendChild(text)
  panel.appendChild(usage)
  panel.appendChild(actions)

  function setStatus(message, isError) {
    status.textContent = message || ''
    status.setAttribute('data-error', isError ? 'true' : 'false')
  }

  function run() {
    const i = currentIndex()
    const key = keyOf(i)
    const usedEngine = engine
    results.set(key, { state: 'running', text: '' })
    render()
    ocr.extract(images[i].src, usedEngine).then(
      result => {
        const r = typeof result === 'string' ? { text: result } : result
        results.set(key, {
          state: 'done',
          text: (r.text || '').trim(),
          note: r.note || '',
          warning: r.warning || ''
        })
        render()
      },
      err => {
        results.set(key, {
          state: 'error',
          text: '',
          error: (err && err.message) || String(err)
        })
        render()
      }
    )
  }

  function render() {
    toggle.setAttribute('aria-pressed', open ? 'true' : 'false')
    panel.hidden = !open
    engineButtons.forEach(({ id, button }) => {
      button.setAttribute('aria-pressed', id === engine ? 'true' : 'false')
    })
    const entry = results.get(keyOf(currentIndex()))
    const state = entry ? entry.state : 'idle'
    if (state === 'running') setStatus(labels.running)
    else if (state === 'error') setStatus(entry.error, true)
    else if (state === 'done' && entry.warning) setStatus(entry.warning, true)
    else if (state === 'done' && entry.text === '') setStatus(labels.empty)
    else setStatus('')
    usage.textContent = state === 'done' ? entry.note : ''
    if (text.value !== (entry ? entry.text : '')) {
      text.value = entry ? entry.text : ''
    }
    text.disabled = state !== 'done'
    runButton.textContent = state === 'idle' ? labels.run : labels.retry
    runButton.disabled = state === 'running'
    const hasText = state === 'done' && text.value.trim() !== ''
    copyButton.disabled = !hasText
    // 同じ文章を続けて挿入しない。直したら、その文章はまた挿入できる
    const last = inserted.get(currentIndex())
    if (insertButton) {
      insertButton.disabled = !hasText || last === text.value
    }
    if (undoButton) undoButton.hidden = last == null
  }

  toggle.addEventListener('click', e => {
    e.stopPropagation()
    open = !open
    // 開いた操作そのものを「この画像を読み取る」指示として扱う
    const entry = results.get(keyOf(currentIndex()))
    if (open && !entry) run()
    else render()
  })
  runButton.addEventListener('click', run)
  copyButton.addEventListener('click', () => {
    ocr.copy(text.value)
    setStatus(labels.copied)
  })
  if (insertButton) {
    insertButton.addEventListener('click', () => {
      const i = currentIndex()
      const result = ocr.insert(i, text.value, inserted.get(i))
      // 挿入済み（今回でも以前でも）なら、同じ文章ではもう押せなくする
      if (result) inserted.set(i, text.value)
      render()
      const messages = {
        exists: labels.alreadyInserted,
        replaced: labels.replaced
      }
      if (messages[result]) setStatus(messages[result])
      else setStatus(result ? labels.inserted : labels.insertFailed, !result)
    })
  }
  if (undoButton) {
    undoButton.addEventListener('click', () => {
      const i = currentIndex()
      const ok = ocr.remove(i, inserted.get(i))
      // 手で直されていて消せなかったときも、記録は外す（別の文章を消しに行かない）
      inserted.delete(i)
      render()
      setStatus(ok ? labels.undone : labels.undoFailed, !ok)
    })
  }

  return { toggle, panel, render }
}

/**
 * ライトボックスを開く
 * @param {Object} options
 * @param {HTMLImageElement[]} options.images 送り対象の画像（プレビュー内の並び順）
 * @param {number} options.index 最初に表示する画像の位置
 * @param {Element} options.frame プレビューのiframe（座標の換算に使う）
 * @param {Object} options.labels { previous, next, close }
 * @param {Document} [options.doc] オーバーレイを置くdocument
 * @param {Object} [options.ocr] 画像の文字の読み取り。無ければボタンを出さない
 *   { engines: [{id, label}], engine, onEngineChange(id),
 *     extract(src, engine) => Promise<string | {text, note?, warning?}>,
 *     copy(text), insert?(index, text, previous) => true | false | 'exists' | 'replaced',
 *     remove?(index, text) => boolean, labels }
 * @returns {Function} 閉じる関数
 */
export function openImageLightbox(options) {
  const { images, frame, labels } = options
  const doc = options.doc || document
  const win = doc.defaultView
  const animate = !prefersReducedMotion(win)
  let index = options.index
  let closing = false

  // 開いたままのものがあれば、キーの登録ごと閉じてから開く（DOMだけ消すと古い送り操作が残る）
  if (activeClose) activeClose(true)
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
  const tools = doc.createElement('div')
  tools.className = 'imageLightbox-tools'
  tools.appendChild(closeButton)
  bar.appendChild(counter)
  bar.appendChild(tools)

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

  const body = doc.createElement('div')
  body.className = 'imageLightbox-body'
  body.appendChild(stage)

  overlay.appendChild(bar)
  overlay.appendChild(body)

  // 読み取りのパネル。indexは「今どの画像か」を毎回問い合わせる
  const ocrPanel = options.ocr
    ? createOcrPanel(doc, options.ocr, images, () => index)
    : null
  if (ocrPanel) {
    tools.insertBefore(ocrPanel.toggle, closeButton)
    body.appendChild(ocrPanel.panel)
  }

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
    if (ocrPanel) ocrPanel.render()
  }

  function step(delta) {
    const next = stepIndex(index, delta, images.length)
    if (next !== index) show(next)
  }

  // immediateは、次のライトボックスに置き換えるときにアニメーションなしで閉じる指定
  function close(immediate) {
    if (closing) return
    closing = true
    if (activeClose === close) activeClose = null
    win.removeEventListener('keydown', handleKeyDown, true)
    const from = view.getBoundingClientRect()
    const to = sourceRect(images[index], frame.getBoundingClientRect(), win)
    if (immediate === true || !animate || !to || from.width === 0) {
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
    // 結果欄の編集中はカーソル移動を奪わない。Escは欄から抜けるだけにする
    if (isEditable(e.target)) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        overlay.focus()
      }
      return
    }
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
  // 背景で押して背景で離したときだけ閉じる。結果欄で文字を選びながらパネルの外で離すと、
  // clickは共通の親で起きるため、パネル側のstopPropagationでは止まらない
  const isBackdrop = el =>
    el === overlay || el === body || el === stage || el === bar
  let pressedOnBackdrop = false
  overlay.addEventListener('mousedown', e => {
    pressedOnBackdrop = isBackdrop(e.target)
  })
  overlay.addEventListener('click', e => {
    if (pressedOnBackdrop && isBackdrop(e.target)) close()
    pressedOnBackdrop = false
  })
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

  activeClose = close
  return close
}

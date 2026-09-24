/**
 * @fileoverview browser/lib/imageLightboxの送り操作と表示のテスト
 */
import {
  openImageLightbox,
  stepIndex,
  OVERLAY_ID
} from 'browser/lib/imageLightbox'

const LABELS = { previous: 'Previous', next: 'Next', close: 'Close' }

function setup(count) {
  document.body.innerHTML = ''
  const frame = document.createElement('div')
  document.body.appendChild(frame)
  const images = Array.from({ length: count }, (_, i) => {
    const img = document.createElement('img')
    img.src = `https://example.com/${i}.png`
    return img
  })
  return { frame, images }
}

function overlay() {
  return document.getElementById(OVERLAY_ID)
}

function current() {
  return overlay()
    .querySelector('.imageLightbox-image')
    .getAttribute('src')
}

// 背景で押して離す（閉じる操作）
function clickBackdrop() {
  const el = overlay()
  el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  el.click()
}

function press(key) {
  window.dispatchEvent(
    new window.KeyboardEvent('keydown', { key, bubbles: true })
  )
}

beforeAll(() => {
  // jsdomにはscrollIntoViewが無い
  window.Element.prototype.scrollIntoView = () => {}
})

test('stepIndexは端で止まる', () => {
  // [index, delta, length, expected]
  const testCases = [
    [0, -1, 3, 0],
    [0, 1, 3, 1],
    [2, 1, 3, 2],
    [1, -1, 3, 0]
  ]
  testCases.forEach(([index, delta, length, expected]) => {
    expect(stepIndex(index, delta, length)).toBe(expected)
  })
})

test('左右キーで前後の画像に送り、Escで閉じる', () => {
  const { frame, images } = setup(3)
  openImageLightbox({ images, index: 1, frame, labels: LABELS })
  expect(current()).toBe(images[1].src)
  expect(overlay().querySelector('.imageLightbox-counter').textContent).toBe(
    '2 / 3'
  )

  press('ArrowRight')
  expect(current()).toBe(images[2].src)
  press('ArrowRight')
  expect(current()).toBe(images[2].src)
  press('ArrowLeft')
  press('ArrowLeft')
  expect(current()).toBe(images[0].src)

  press('Escape')
  expect(overlay()).toBeNull()
  // 閉じた後はキーを奪わない
  const listener = jest.fn()
  window.addEventListener('keydown', listener)
  press('ArrowRight')
  expect(listener).toHaveBeenCalled()
  window.removeEventListener('keydown', listener)
})

test('矢印ボタンとサムネイルで送れる。端では矢印を隠す', () => {
  const { frame, images } = setup(3)
  openImageLightbox({ images, index: 0, frame, labels: LABELS })
  const prev = overlay().querySelector('.imageLightbox-prev')
  const next = overlay().querySelector('.imageLightbox-next')
  expect(prev.hidden).toBe(true)
  expect(next.hidden).toBe(false)

  next.click()
  expect(current()).toBe(images[1].src)
  expect(overlay()).not.toBeNull()

  const thumbs = overlay().querySelectorAll('.imageLightbox-thumb')
  expect(thumbs.length).toBe(3)
  thumbs[2].click()
  expect(current()).toBe(images[2].src)
  expect(thumbs[2].getAttribute('aria-current')).toBe('true')
  expect(next.hidden).toBe(true)
})

test('1枚だけのときは送りの操作を出さない', () => {
  const { frame, images } = setup(1)
  openImageLightbox({ images, index: 0, frame, labels: LABELS })
  expect(overlay().querySelectorAll('.imageLightbox-thumb').length).toBe(0)
  expect(overlay().querySelector('.imageLightbox-prev').hidden).toBe(true)
  expect(overlay().querySelector('.imageLightbox-next').hidden).toBe(true)
  clickBackdrop()
  expect(overlay()).toBeNull()
})

function ocrOptions(overrides) {
  return Object.assign(
    {
      engines: [
        { id: 'ai', label: 'AI' },
        { id: 'vision', label: 'Device' }
      ],
      engine: 'ai',
      onEngineChange: jest.fn(),
      extract: jest.fn(src => Promise.resolve(`text of ${src}`)),
      copy: jest.fn(),
      insert: jest.fn(() => true),
      remove: jest.fn(() => true),
      labels: {
        extract: 'Extract',
        title: 'Text',
        engine: 'Method',
        run: 'Read',
        retry: 'Again',
        running: 'Reading',
        empty: 'Empty',
        copy: 'Copy',
        copied: 'Copied',
        insert: 'Insert',
        inserted: 'Inserted',
        insertFailed: 'Failed',
        alreadyInserted: 'Exists',
        replaced: 'Replaced',
        undo: 'Undo',
        undone: 'Undone',
        undoFailed: 'UndoFailed'
      }
    },
    overrides
  )
}

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

test('抽出ボタンで表示中の画像だけを読み取り、送っても自動では読み取らない', async () => {
  const { frame, images } = setup(3)
  const ocr = ocrOptions()
  openImageLightbox({ images, index: 1, frame, labels: LABELS, ocr })
  const panel = overlay().querySelector('.imageLightbox-ocr')
  expect(panel.hidden).toBe(true)
  expect(ocr.extract).not.toHaveBeenCalled()

  overlay()
    .querySelector('.imageLightbox-tools .imageLightbox-textButton')
    .click()
  expect(panel.hidden).toBe(false)
  expect(ocr.extract).toHaveBeenCalledWith(images[1].src, 'ai')
  await flush()
  const text = panel.querySelector('textarea')
  expect(text.value).toBe(`text of ${images[1].src}`)

  press('ArrowRight')
  expect(ocr.extract).toHaveBeenCalledTimes(1)
  expect(text.value).toBe('')
  press('ArrowLeft')
  expect(text.value).toBe(`text of ${images[1].src}`)
})

test('結果欄の編集中は左右キーで送らず、Escでは閉じない', async () => {
  const { frame, images } = setup(3)
  openImageLightbox({
    images,
    index: 0,
    frame,
    labels: LABELS,
    ocr: ocrOptions()
  })
  overlay()
    .querySelector('.imageLightbox-tools .imageLightbox-textButton')
    .click()
  await flush()
  const text = overlay().querySelector('textarea')
  text.focus()
  text.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
  )
  expect(current()).toBe(images[0].src)
  text.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )
  expect(overlay()).not.toBeNull()
})

test('方式を切り替えると保存し、コピーと挿入は編集後の文章を渡す', async () => {
  const { frame, images } = setup(2)
  const ocr = ocrOptions()
  openImageLightbox({ images, index: 0, frame, labels: LABELS, ocr })
  const panel = overlay().querySelector('.imageLightbox-ocr')
  overlay()
    .querySelector('.imageLightbox-tools .imageLightbox-textButton')
    .click()
  await flush()

  const text = panel.querySelector('textarea')
  text.value = '直した文章'
  text.dispatchEvent(new window.Event('input'))
  const buttons = Array.from(panel.querySelectorAll('button'))
  const byLabel = label => buttons.find(b => b.textContent === label)
  byLabel('Copy').click()
  expect(ocr.copy).toHaveBeenCalledWith('直した文章')
  byLabel('Insert').click()
  expect(ocr.insert).toHaveBeenCalledWith(0, '直した文章', undefined)

  byLabel('Device').click()
  expect(ocr.onEngineChange).toHaveBeenCalledWith('vision')
  // 方式ごとに結果を分けて持つので、切り替えた直後は空
  expect(text.value).toBe('')
  // パネル内のクリックでは閉じない
  expect(overlay()).not.toBeNull()
})

test('読み取りに失敗したら理由を表示する', async () => {
  const { frame, images } = setup(1)
  const ocr = ocrOptions({
    extract: () => Promise.reject(new Error('形式が違います'))
  })
  openImageLightbox({ images, index: 0, frame, labels: LABELS, ocr })
  overlay()
    .querySelector('.imageLightbox-tools .imageLightbox-textButton')
    .click()
  await flush()
  const status = overlay().querySelector('.imageLightbox-ocrStatus')
  expect(status.textContent).toBe('形式が違います')
  expect(status.getAttribute('data-error')).toBe('true')
})

test('使用量と途中切れの注意を表示し、同じ文章は続けて挿入できない', async () => {
  const { frame, images } = setup(1)
  const ocr = ocrOptions({
    extract: () =>
      Promise.resolve({
        text: '文字',
        note: 'トークン: 入力10 / 出力2',
        warning: '途中までです'
      })
  })
  openImageLightbox({ images, index: 0, frame, labels: LABELS, ocr })
  overlay()
    .querySelector('.imageLightbox-tools .imageLightbox-textButton')
    .click()
  await flush()
  const panel = overlay().querySelector('.imageLightbox-ocr')
  expect(panel.querySelector('.imageLightbox-ocrUsage').textContent).toBe(
    'トークン: 入力10 / 出力2'
  )
  expect(panel.querySelector('.imageLightbox-ocrStatus').textContent).toBe(
    '途中までです'
  )

  const insert = Array.from(panel.querySelectorAll('button')).find(
    b => b.textContent === 'Insert'
  )
  insert.click()
  expect(ocr.insert).toHaveBeenCalledTimes(1)
  expect(insert.disabled).toBe(true)
  insert.click()
  expect(ocr.insert).toHaveBeenCalledTimes(1)

  // 直した文章はまた挿入できる
  const text = panel.querySelector('textarea')
  text.value = '直した文字'
  text.dispatchEvent(new window.Event('input'))
  expect(insert.disabled).toBe(false)
})

test('方式を変えて入れ直すと前の文章を渡し、元に戻すで取り除く', async () => {
  const { frame, images } = setup(1)
  let n = 0
  const ocr = ocrOptions({
    extract: () => Promise.resolve(`結果${++n}`),
    insert: jest.fn((i, text, previous) => (previous ? 'replaced' : true))
  })
  openImageLightbox({ images, index: 0, frame, labels: LABELS, ocr })
  overlay()
    .querySelector('.imageLightbox-tools .imageLightbox-textButton')
    .click()
  await flush()
  const panel = overlay().querySelector('.imageLightbox-ocr')
  const button = label =>
    Array.from(panel.querySelectorAll('button')).find(
      b => b.textContent === label
    )
  expect(button('Undo').hidden).toBe(true)
  button('Insert').click()
  expect(ocr.insert).toHaveBeenLastCalledWith(0, '結果1', undefined)
  expect(button('Undo').hidden).toBe(false)

  // 端末内に切り替えて読み取り、入れ直すと置き換えになる
  button('Device').click()
  button('Read').click()
  await flush()
  button('Insert').click()
  expect(ocr.insert).toHaveBeenLastCalledWith(0, '結果2', '結果1')
  expect(panel.querySelector('.imageLightbox-ocrStatus').textContent).toBe(
    'Replaced'
  )

  button('Undo').click()
  expect(ocr.remove).toHaveBeenCalledWith(0, '結果2')
  expect(button('Undo').hidden).toBe(true)
  expect(button('Insert').disabled).toBe(false)
})

test('開いたまま別の画像で開き直すと、古い方のキー操作は残らない', () => {
  // captureで登録したkeydownの数を数える
  const active = new Set()
  const add = jest
    .spyOn(window, 'addEventListener')
    .mockImplementation(function(type, fn, capture) {
      if (type === 'keydown' && capture === true) active.add(fn)
    })
  const remove = jest
    .spyOn(window, 'removeEventListener')
    .mockImplementation(function(type, fn, capture) {
      if (type === 'keydown' && capture === true) active.delete(fn)
    })
  try {
    const first = setup(3)
    openImageLightbox({
      images: first.images,
      index: 0,
      frame: first.frame,
      labels: LABELS
    })
    expect(active.size).toBe(1)
    const second = setup(2)
    openImageLightbox({
      images: second.images,
      index: 0,
      frame: second.frame,
      labels: LABELS
    })
    expect(active.size).toBe(1)
    expect(document.querySelectorAll(`#${OVERLAY_ID}`).length).toBe(1)
  } finally {
    add.mockRestore()
    remove.mockRestore()
    const leftover = overlay()
    if (leftover) clickBackdrop()
  }
})

test('結果欄で押してパネルの外で離しても閉じない', async () => {
  const { frame, images } = setup(1)
  openImageLightbox({
    images,
    index: 0,
    frame,
    labels: LABELS,
    ocr: ocrOptions()
  })
  overlay()
    .querySelector('.imageLightbox-tools .imageLightbox-textButton')
    .click()
  await flush()
  const text = overlay().querySelector('textarea')
  // 文字を選びながら外へ出て離すと、clickは共通の親（背景側）で起きる
  text.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  overlay()
    .querySelector('.imageLightbox-body')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  expect(overlay()).not.toBeNull()
  clickBackdrop()
  expect(overlay()).toBeNull()
})

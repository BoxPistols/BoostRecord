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
  overlay().click()
  expect(overlay()).toBeNull()
})

/**
 * @fileoverview browser/lib/youtubeEmbed と lib/youtube/referer のテスト
 */
import {
  parseYouTubeUrl,
  embedUrl,
  thumbnailUrl,
  hydrateYouTubeLinks,
  CARD_CLASS
} from 'browser/lib/youtubeEmbed'
const { withReferer } = require('../../lib/youtube/referer')

const OPTIONS = { playLabel: 'Play %s', openLabel: 'Open on YouTube' }

test('YouTubeのURLから動画IDと開始位置を取り出す', () => {
  // [URL, 期待]
  const testCases = [
    [
      'https://youtu.be/exampleId01?si=trackingValue',
      { id: 'exampleId01', start: 0 }
    ],
    [
      'https://www.youtube.com/watch?v=exampleId01&t=90',
      { id: 'exampleId01', start: 90 }
    ],
    [
      'https://m.youtube.com/watch?v=exampleId01&t=1m30s',
      { id: 'exampleId01', start: 90 }
    ],
    ['https://youtube.com/shorts/exampleId01', { id: 'exampleId01', start: 0 }],
    [
      'https://www.youtube.com/live/exampleId01?t=1h2m3s',
      { id: 'exampleId01', start: 3723 }
    ],
    [
      'https://www.youtube.com/embed/exampleId01',
      { id: 'exampleId01', start: 0 }
    ],
    ['https://example.com/watch?v=exampleId01', null],
    ['https://www.youtube.com/watch?v=short', null],
    ['https://www.youtube.com/channel/example', null],
    ['javascript:alert(1)', null],
    ['not a url', null]
  ]
  testCases.forEach(([url, expected]) => {
    expect(parseYouTubeUrl(url)).toEqual(expected)
  })
})

test('埋め込みはnocookieのドメインで、共有URLの追跡用パラメータを引き継がない', () => {
  expect(embedUrl('exampleId01', 0)).toBe(
    'https://www.youtube-nocookie.com/embed/exampleId01?autoplay=1&rel=0'
  )
  expect(embedUrl('exampleId01', 90)).toMatch(/&start=90$/)
  expect(thumbnailUrl('exampleId01')).toBe(
    'https://i.ytimg.com/vi/exampleId01/hqdefault.jpg'
  )
})

function setup(html) {
  document.head.innerHTML = ''
  document.body.innerHTML = html
  return document
}

test('段落に単独のリンクだけをサムネイルにし、文中のリンクは残す', () => {
  const doc = setup(
    '<p><a href="https://youtu.be/exampleId01?si=x">https://youtu.be/exampleId01?si=x</a></p>' +
      '<p>参考は <a href="https://youtu.be/exampleId02">こちら</a> です</p>' +
      '<p><a href="https://example.com/">https://example.com/</a></p>'
  )
  const onLinkCreated = jest.fn()
  expect(
    hydrateYouTubeLinks(doc, Object.assign({ onLinkCreated }, OPTIONS))
  ).toBe(1)
  const cards = doc.querySelectorAll(`button.${CARD_CLASS}`)
  expect(cards).toHaveLength(1)
  expect(cards[0].querySelector('img').src).toBe(thumbnailUrl('exampleId01'))
  // 文中のリンクと、YouTube以外のリンクはそのまま
  expect(
    doc.querySelectorAll('a[href="https://youtu.be/exampleId02"]')
  ).toHaveLength(1)
  expect(doc.querySelectorAll('a[href="https://example.com/"]')).toHaveLength(1)
  // YouTubeで開くリンクには、外部で開く処理を付ける
  expect(onLinkCreated).toHaveBeenCalledTimes(1)
  // 開いただけではプレーヤーを読み込まない
  expect(doc.querySelectorAll('iframe')).toHaveLength(0)
})

test('サムネイルを押すとプレーヤーに差し替える', () => {
  const doc = setup(
    '<p><a href="https://www.youtube.com/watch?v=exampleId01&t=90">動画</a></p>'
  )
  hydrateYouTubeLinks(doc, OPTIONS)
  const card = doc.querySelector(`button.${CARD_CLASS}`)
  expect(card.getAttribute('aria-label')).toBe('Play 動画')
  card.click()
  const frame = doc.querySelector('iframe')
  expect(frame.src).toBe(embedUrl('exampleId01', 90))
  expect(doc.querySelector(`button.${CARD_CLASS}`)).toBeNull()
})

test('Refererが無いときだけ補い、あれば触らない', () => {
  expect(withReferer({ Accept: '*/*' })).toEqual({
    Accept: '*/*',
    Referer: 'https://www.youtube-nocookie.com/'
  })
  const given = { referer: 'https://example.com/' }
  expect(withReferer(given)).toBe(given)
})

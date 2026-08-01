/**
 * @fileoverview Unit test for the bookmark-card pipeline:
 * browser/lib/markdown.js (```bookmark fence) →
 * browser/lib/bookmarkCards.js (size resolution, card DOM, hydration) and
 * browser/lib/imageRows.js (consecutive-image rows).
 */
jest.mock(
  'electron',
  () => {
    return {
      remote: {
        app: {
          getPath: jest.fn().mockReturnValue('.')
        }
      }
    }
  },
  { virtual: true }
)

import Markdown from 'browser/lib/markdown'
const cards = require('browser/lib/bookmarkCards')
const imageRows = require('browser/lib/imageRows')

// ---- fence rendering ------------------------------------------------------

test('```bookmark fence renders a .bookmark placeholder with size/img', () => {
  const md = new Markdown()
  const rendered = md.render(
    '```bookmark(size=l img=shot)\nhttps://example.com/page\n```'
  )

  expect(rendered).toContain('class="bookmark"')
  expect(rendered).toContain('data-size="l"')
  expect(rendered).toContain('data-img="shot"')
  expect(rendered).toContain('https://example.com/page')
})

test('```bookmark fence accepts [title](url) and <url> lines', () => {
  const md = new Markdown()
  const rendered = md.render(
    '```bookmark\n[Example](https://example.com/a)\n<https://example.com/b>\nhttps://example.com/c\n```'
  )

  expect(rendered).toContain('https://example.com/a')
  expect(rendered).toContain('https://example.com/b')
  expect(rendered).toContain('https://example.com/c')
})

test('```bookmark fence sanitizes parameter values', () => {
  const md = new Markdown()
  const rendered = md.render(
    "```bookmark(size='\"><script>')\nhttps://example.com\n```"
  )

  expect(rendered).not.toContain('data-size=""><script>')
  expect(rendered).toContain('class="bookmark"')
})

// ---- size resolution ------------------------------------------------------

test('resolveCardSize maps presets, numbers and garbage', () => {
  expect(cards.resolveCardSize('s')).toEqual(cards.SIZE_PRESETS.s)
  expect(cards.resolveCardSize('M')).toEqual(cards.SIZE_PRESETS.m)
  expect(cards.resolveCardSize('l')).toEqual(cards.SIZE_PRESETS.l)
  // seamless numeric width (px)
  expect(cards.resolveCardSize('400').width).toBe(400)
  // clamped to sane bounds
  expect(cards.resolveCardSize('10').width).toBe(140)
  expect(cards.resolveCardSize('99999').width).toBe(1200)
  // default = M
  expect(cards.resolveCardSize('')).toEqual(cards.SIZE_PRESETS.m)
  expect(cards.resolveCardSize('weird')).toEqual(cards.SIZE_PRESETS.m)
  expect(cards.resolveCardSize(null)).toEqual(cards.SIZE_PRESETS.m)
})

// ---- card DOM -------------------------------------------------------------

test('buildBookmarkCard renders metadata as text, never markup', () => {
  const data = {
    url: 'https://example.com',
    domain: 'example.com',
    title: '<img src=x onerror=alert(1)>',
    description: '<script>alert(2)</script>',
    siteName: null,
    imageUrl: 'https://example.com/og.png',
    faviconUrl: 'https://example.com/favicon.ico'
  }
  const card = cards.buildBookmarkCard(document, data, cards.SIZE_PRESETS.m)

  expect(card.tagName).toBe('A')
  expect(card.getAttribute('href')).toBe('https://example.com')
  expect(card.style.width).toBe('320px')
  expect(card.querySelector('.bookmarkCard-title').textContent).toBe(data.title)
  // the payload exists only as text — no elements were created from it
  expect(card.querySelectorAll('script').length).toBe(0)
  expect(card.querySelectorAll('img').length).toBe(2) // og image + favicon
})

test('buildBookmarkCard skips non-http image sources', () => {
  const card = cards.buildBookmarkCard(
    document,
    {
      url: 'https://example.com',
      domain: 'example.com',
      imageUrl: 'javascript:alert(1)',
      faviconUrl: 'file:///etc/passwd'
    },
    cards.SIZE_PRESETS.s
  )
  expect(card.querySelectorAll('img').length).toBe(0)
})

// ---- hydration ------------------------------------------------------------

test('hydrateBookmarkFences builds a card row from placeholders', () => {
  document.body.innerHTML =
    '<pre class="fence"><div class="bookmark" data-size="s" data-img="">' +
    'https://example.com/a\nhttps://example.com/b</div></pre>'

  const linked = []
  return cards
    .hydrateBookmarkFences(document, {
      fetchPreview: url =>
        Promise.resolve({
          url,
          domain: 'example.com',
          title: `Title of ${url}`,
          description: 'desc',
          imageUrl: null,
          faviconUrl: null
        }),
      onLinkCreated: a => linked.push(a)
    })
    .then(() => {
      const row = document.querySelector('.bookmarkRow')
      expect(row).not.toBe(null)
      const cardEls = row.querySelectorAll('a.bookmarkCard')
      expect(cardEls.length).toBe(2)
      expect(cardEls[0].style.width).toBe('200px')
      expect(cardEls[0].textContent).toContain('Title of https://example.com/a')
      // skeleton + final card both registered for click handling
      expect(linked.length).toBeGreaterThanOrEqual(2)
    })
})

test('hydrateBookmarkFences falls back to a plain card on fetch failure', () => {
  document.body.innerHTML =
    '<div class="bookmark" data-size="" data-img="">https://example.com/x</div>'

  return cards
    .hydrateBookmarkFences(document, {
      fetchPreview: () => Promise.reject(new Error('offline'))
    })
    .then(() => {
      const card = document.querySelector('a.bookmarkCard')
      expect(card).not.toBe(null)
      expect(card.getAttribute('href')).toBe('https://example.com/x')
      expect(card.textContent).toContain('example.com')
    })
})

// ---- consecutive image rows ----------------------------------------------

test('markImageRows marks paragraphs of 2+ images only', () => {
  document.body.innerHTML =
    '<p><img src="a.png"/><br/><img src="b.png"/><br/><img src="c.png"/></p>' +
    '<p><img src="solo.png"/></p>' +
    '<p>text <img src="mixed.png"/></p>' +
    '<p><a href="x"><img src="linked1.png"/></a><br/><a href="y"><img src="linked2.png"/></a></p>'

  const marked = imageRows.markImageRows(document)

  const paragraphs = document.querySelectorAll('p')
  expect(marked).toBe(2)
  expect(paragraphs[0].classList.contains('imageRow')).toBe(true)
  expect(paragraphs[1].classList.contains('imageRow')).toBe(false)
  expect(paragraphs[2].classList.contains('imageRow')).toBe(false)
  expect(paragraphs[3].classList.contains('imageRow')).toBe(true)
})

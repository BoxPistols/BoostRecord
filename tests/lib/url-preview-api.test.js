/**
 * @fileoverview Unit test for browser/lib/urlPreviewFetcher and
 * browser/lib/urlPreviewTooltip
 */
const fetcher = require('browser/lib/urlPreviewFetcher')
const tooltip = require('browser/lib/urlPreviewTooltip')

test('urlPreviewFetcher exposes its API as functions', () => {
  expect(typeof fetcher.isPreviewableUrl).toBe('function')
  expect(typeof fetcher.getDomain).toBe('function')
  expect(typeof fetcher.parsePreviewMetadata).toBe('function')
  expect(typeof fetcher.fetchUrlPreview).toBe('function')
  expect(typeof fetcher.clearUrlPreviewCache).toBe('function')
})

test('urlPreviewTooltip exposes its API', () => {
  expect(typeof tooltip.attachUrlPreviewTooltip).toBe('function')
  expect(typeof tooltip.TOOLTIP_ID).toBe('string')
  expect(typeof tooltip.STYLE_ID).toBe('string')
})

test('isPreviewableUrl accepts only http(s) urls', () => {
  // [input, expected]
  const testCases = [
    ['https://example.com', true],
    ['http://example.com/path?q=1', true],
    ['HTTPS://EXAMPLE.COM', true],
    ['  https://example.com  ', true],
    ['file:///etc/passwd', false],
    ['mailto:test@example.com', false],
    ['#heading', false],
    [':note:7dd23275-f2b4-49cb-9e93-3454daf1af9c', false],
    [':line:10', false],
    [':tag:work', false],
    ['', false],
    [null, false],
    [undefined, false]
  ]

  testCases.forEach(([input, expected]) => {
    expect(fetcher.isPreviewableUrl(input)).toBe(expected)
  })
})

test('parsePreviewMetadata extracts Open Graph metadata', () => {
  const html = `<!doctype html>
    <html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="OG Title">
      <meta property="og:description" content="OG description text">
      <meta property="og:site_name" content="Example Site">
      <meta property="og:image" content="/images/card.png">
      <link rel="icon" href="/favicon.png">
    </head><body></body></html>`

  const meta = fetcher.parsePreviewMetadata(html, 'https://example.com/page')

  expect(meta.url).toBe('https://example.com/page')
  expect(meta.domain).toBe('example.com')
  expect(meta.title).toBe('OG Title')
  expect(meta.description).toBe('OG description text')
  expect(meta.siteName).toBe('Example Site')
  // relative urls are resolved against the page url
  expect(meta.imageUrl).toBe('https://example.com/images/card.png')
  expect(meta.faviconUrl).toBe('https://example.com/favicon.png')
  expect(meta.isImage).toBe(false)
})

test('parsePreviewMetadata falls back to <title> and default favicon', () => {
  const html = `<html><head><title> Plain page </title></head><body></body></html>`

  const meta = fetcher.parsePreviewMetadata(html, 'https://example.org/x')

  expect(meta.title).toBe('Plain page')
  expect(meta.description).toBe(null)
  expect(meta.imageUrl).toBe(null)
  expect(meta.faviconUrl).toBe('https://example.org/favicon.ico')
})

test('attachUrlPreviewTooltip injects style and detach cleans it up', () => {
  document.body.innerHTML =
    '<p><a href="https://example.com">external link</a></p>'

  const detach = tooltip.attachUrlPreviewTooltip(document, {
    fetchPreview: () => Promise.resolve({ url: 'https://example.com' })
  })

  expect(typeof detach).toBe('function')
  expect(document.getElementById(tooltip.STYLE_ID)).not.toBe(null)

  detach()

  expect(document.getElementById(tooltip.STYLE_ID)).toBe(null)
  expect(document.getElementById(tooltip.TOOLTIP_ID)).toBe(null)
})

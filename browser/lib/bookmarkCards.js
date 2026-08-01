/**
 * @fileoverview Notion-style bookmark cards for the markdown preview.
 *
 * A ```bookmark fence (see browser/lib/markdown.js) renders a placeholder
 * `<div class="bookmark">` holding one URL per line. hydrateBookmarkFences()
 * replaces each placeholder with a responsive flex row of link cards showing
 * the page's OGP image (or a captured screenshot), favicon, title,
 * description and domain.
 *
 * Pure DOM module: metadata fetching and screenshot capture come in as
 * callbacks, so this file stays importable without Electron.
 */

import { isPreviewableUrl, getDomain } from './urlPreviewFetcher'

// Card widths in px. The image pane keeps a fixed aspect via imageHeight.
export const SIZE_PRESETS = {
  s: { width: 200, imageHeight: 100 },
  m: { width: 320, imageHeight: 150 },
  l: { width: 480, imageHeight: 220 }
}

const MIN_CUSTOM_WIDTH = 140
const MAX_CUSTOM_WIDTH = 1200
const IMAGE_HEIGHT_RATIO = 0.47

/**
 * 's' | 'm' | 'l' | numeric string (px width, seamless) → {width, imageHeight}
 */
export function resolveCardSize(sizeAttr) {
  const raw = (sizeAttr || '')
    .toString()
    .trim()
    .toLowerCase()
  if (SIZE_PRESETS[raw] != null) return SIZE_PRESETS[raw]
  if (/^\d+$/.test(raw)) {
    const width = Math.min(
      MAX_CUSTOM_WIDTH,
      Math.max(MIN_CUSTOM_WIDTH, parseInt(raw, 10))
    )
    return { width, imageHeight: Math.round(width * IMAGE_HEIGHT_RATIO) }
  }
  return SIZE_PRESETS.m
}

/**
 * The fence body holds one URL per line (markdown.js already stripped
 * `[title](url)` / `<url>` wrappers and mdurl-encoded each line).
 */
export function parseBookmarkUrls(text) {
  return (text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => isPreviewableUrl(line))
}

function isCardImageSrc(src) {
  return (
    typeof src === 'string' &&
    (isPreviewableUrl(src) || src.indexOf('data:image/') === 0)
  )
}

// Every text node goes in via textContent — metadata comes from arbitrary
// external pages and must never be able to inject markup.
export function buildBookmarkCard(doc, data, size) {
  const card = doc.createElement('a')
  card.className = 'bookmarkCard'
  card.setAttribute('href', data.url)
  card.setAttribute('rel', 'noopener')
  card.style.width = `${size.width}px`
  card.style.maxWidth = '100%'

  if (isCardImageSrc(data.imageUrl)) {
    const image = doc.createElement('img')
    image.className = 'bookmarkCard-image'
    image.style.height = `${size.imageHeight}px`
    image.src = data.imageUrl
    image.onerror = () => image.remove()
    card.appendChild(image)
  }

  const body = doc.createElement('div')
  body.className = 'bookmarkCard-body'

  if (data.title) {
    const title = doc.createElement('div')
    title.className = 'bookmarkCard-title'
    title.textContent = data.title
    body.appendChild(title)
  }
  if (data.description) {
    const description = doc.createElement('div')
    description.className = 'bookmarkCard-description'
    description.textContent = data.description
    body.appendChild(description)
  }

  const site = doc.createElement('div')
  site.className = 'bookmarkCard-site'
  if (isCardImageSrc(data.faviconUrl)) {
    const favicon = doc.createElement('img')
    favicon.className = 'bookmarkCard-favicon'
    favicon.src = data.faviconUrl
    favicon.onerror = () => favicon.remove()
    site.appendChild(favicon)
  }
  const siteLabel = doc.createElement('span')
  siteLabel.textContent =
    data.siteName || data.domain || getDomain(data.url) || data.url
  site.appendChild(siteLabel)
  body.appendChild(site)

  card.appendChild(body)
  return card
}

function hydrateCard(doc, container, url, size, imgMode, opts) {
  // Immediate skeleton so the layout doesn't jump while fetching.
  let card = buildBookmarkCard(doc, { url, domain: getDomain(url) }, size)
  card.classList.add('bookmarkCard--loading')
  container.appendChild(card)
  if (typeof opts.onLinkCreated === 'function') opts.onLinkCreated(card)

  const replaceCard = data => {
    const fresh = buildBookmarkCard(doc, data, size)
    if (typeof opts.onLinkCreated === 'function') opts.onLinkCreated(fresh)
    container.replaceChild(fresh, card)
    card = fresh
  }

  const withScreenshot = data => {
    if (typeof opts.captureScreenshot !== 'function') return data
    return opts.captureScreenshot(url).then(
      dataUrl => Object.assign({}, data, { imageUrl: dataUrl }),
      () => data
    )
  }

  const fetched =
    typeof opts.fetchPreview === 'function'
      ? opts.fetchPreview(url)
      : Promise.resolve({ url, domain: getDomain(url) })

  return fetched
    .catch(() => ({ url, domain: getDomain(url) }))
    .then(data => {
      if (imgMode === 'none') {
        return Object.assign({}, data, { imageUrl: null })
      }
      if (imgMode === 'shot') {
        return withScreenshot(Object.assign({}, data, { imageUrl: null }))
      }
      if (imgMode === 'auto' && !data.imageUrl) {
        return withScreenshot(data)
      }
      return data // default 'ogp'
    })
    .then(replaceCard)
}

/**
 * Replace every `div.bookmark` placeholder in the document with a flex row
 * of hydrated cards. Returns a promise resolving when all cards settled
 * (loading skeletons render synchronously before that).
 *
 * options:
 *   fetchPreview(url)       -> Promise<metadata>   (urlPreviewFetcher)
 *   captureScreenshot(url)  -> Promise<dataUrl>    (optional)
 *   onLinkCreated(anchorEl) -> void                (attach click handlers)
 */
export function hydrateBookmarkFences(doc, options) {
  const opts = options || {}
  const jobs = []

  const fences = doc.querySelectorAll('div.bookmark')
  for (let i = 0; i < fences.length; i++) {
    const el = fences[i]
    const size = resolveCardSize(el.getAttribute('data-size'))
    const imgMode = (el.getAttribute('data-img') || 'ogp').toLowerCase()
    const urls = parseBookmarkUrls(el.textContent)

    el.innerHTML = ''
    const row = doc.createElement('div')
    row.className = 'bookmarkRow'
    el.appendChild(row)

    if (urls.length === 0) {
      const empty = doc.createElement('span')
      empty.className = 'bookmarkRow-empty'
      empty.textContent = 'bookmark: no http(s) URL'
      row.appendChild(empty)
      continue
    }

    urls.forEach(url => {
      jobs.push(hydrateCard(doc, row, url, size, imgMode, opts))
    })
  }

  return Promise.all(jobs)
}

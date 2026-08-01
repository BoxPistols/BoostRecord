/**
 * @fileoverview Fetches lightweight page metadata (Open Graph / <title> /
 * favicon) for the URL hover-preview popup in the markdown preview pane.
 * Pure browser module: window.fetch + DOM parsing only, no Electron deps.
 */

const CACHE_TTL = 10 * 60 * 1000 // 10 min: metadata rarely changes mid-session
const CACHE_MAX_ENTRIES = 100
const FETCH_TIMEOUT = 8000

// url -> { expiresAt, promise } — storing the promise dedupes in-flight
// requests for the same url (hover on/off/on before the fetch resolves).
const cache = new Map()

export function isPreviewableUrl(href) {
  if (typeof href !== 'string') return false
  return /^https?:\/\//i.test(href.trim())
}

export function getDomain(url) {
  try {
    return new window.URL(url).host
  } catch (e) {
    return url
  }
}

function resolveUrl(maybeRelative, baseUrl) {
  if (!maybeRelative) return null
  try {
    return new window.URL(maybeRelative, baseUrl).href
  } catch (e) {
    return null
  }
}

function emptyMetadata(url) {
  return {
    url,
    domain: getDomain(url),
    title: null,
    description: null,
    siteName: null,
    imageUrl: null,
    faviconUrl: null,
    isImage: false
  }
}

function parseHTML(html) {
  if (typeof window.DOMParser === 'function') {
    try {
      const doc = new window.DOMParser().parseFromString(html, 'text/html')
      if (doc != null && typeof doc.querySelector === 'function') return doc
    } catch (e) {}
  }
  const doc = document.implementation.createHTMLDocument('')
  doc.documentElement.innerHTML = html
  return doc
}

export function parsePreviewMetadata(html, url) {
  const doc = parseHTML(html)
  const pick = names => {
    for (const name of names) {
      const el =
        doc.querySelector(`meta[property="${name}"]`) ||
        doc.querySelector(`meta[name="${name}"]`)
      if (el != null) {
        const content = (el.getAttribute('content') || '').trim()
        if (content !== '') return content
      }
    }
    return null
  }

  const titleEl = doc.querySelector('title')
  const iconEl =
    doc.querySelector('link[rel="apple-touch-icon"]') ||
    doc.querySelector('link[rel="icon"]') ||
    doc.querySelector('link[rel="shortcut icon"]')

  const metadata = emptyMetadata(url)
  metadata.title =
    pick(['og:title', 'twitter:title']) ||
    (titleEl != null ? titleEl.textContent.trim() : null) ||
    null
  metadata.description =
    pick(['og:description', 'twitter:description', 'description']) || null
  metadata.siteName = pick(['og:site_name'])
  metadata.imageUrl = resolveUrl(pick(['og:image', 'twitter:image']), url)
  metadata.faviconUrl = resolveUrl(
    (iconEl != null && iconEl.getAttribute('href')) || '/favicon.ico',
    url
  )
  return metadata
}

function doFetch(url) {
  const controller =
    typeof window.AbortController === 'function'
      ? new window.AbortController()
      : null
  const timer = setTimeout(() => {
    if (controller != null) controller.abort()
  }, FETCH_TIMEOUT)

  return window
    .fetch(url, {
      method: 'get',
      redirect: 'follow',
      signal: controller != null ? controller.signal : undefined
    })
    .then(
      response => {
        clearTimeout(timer)
        const contentType = response.headers.get('content-type') || ''
        if (/^image\//.test(contentType)) {
          const metadata = emptyMetadata(url)
          metadata.imageUrl = url
          metadata.isImage = true
          return metadata
        }
        if (!/text\/html|application\/xhtml/.test(contentType)) {
          return emptyMetadata(url)
        }
        return response
          .text()
          .then(html => parsePreviewMetadata(html, response.url || url))
      },
      err => {
        clearTimeout(timer)
        throw err
      }
    )
}

export function fetchUrlPreview(url) {
  const now = Date.now()
  const hit = cache.get(url)
  if (hit != null && hit.expiresAt > now) return hit.promise

  const promise = doFetch(url).catch(err => {
    // Don't keep failures for the full TTL — the user may be offline briefly.
    cache.delete(url)
    throw err
  })
  cache.set(url, { expiresAt: now + CACHE_TTL, promise })

  if (cache.size > CACHE_MAX_ENTRIES) {
    // Map iterates in insertion order, so the first key is the oldest entry.
    cache.delete(cache.keys().next().value)
  }
  return promise
}

export function clearUrlPreviewCache() {
  cache.clear()
}

/**
 * @fileoverview Hover tooltip that pops up a page preview card (favicon,
 * title, description, og:image) for external links inside the markdown
 * preview iframe. Pure DOM module — receives the iframe document and a
 * fetchPreview callback, no Electron deps.
 *
 * Event listeners are delegated on the document so they survive
 * body.innerHTML rewrites (MarkdownPreview.rewriteIframe replaces the body
 * on every render). The tooltip element itself is recreated on demand.
 */

import { isPreviewableUrl } from './urlPreviewFetcher'

export const TOOLTIP_ID = 'urlPreviewTooltip'
export const STYLE_ID = 'urlPreviewTooltipStyle'

const TOOLTIP_CSS = `
#${TOOLTIP_ID} {
  position: absolute;
  z-index: 1000;
  display: none;
  width: 320px;
  max-width: calc(100vw - 24px);
  box-sizing: border-box;
  border: 1px solid #d5d5d5;
  border-radius: 6px;
  background-color: #ffffff;
  color: #333333;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
  word-break: break-word;
}
#${TOOLTIP_ID}.urlPreviewTooltip--visible {
  display: block;
}
#${TOOLTIP_ID}.urlPreviewTooltip--dark {
  border-color: #464646;
  background-color: #2c2c2c;
  color: #eeeeee;
}
#${TOOLTIP_ID} .urlPreviewTooltip-image {
  display: block;
  width: 100%;
  height: 140px;
  object-fit: cover;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}
#${TOOLTIP_ID} .urlPreviewTooltip-body {
  padding: 8px 10px;
}
#${TOOLTIP_ID} .urlPreviewTooltip-site {
  display: flex;
  align-items: center;
  margin-bottom: 3px;
  opacity: 0.75;
  font-size: 11px;
}
#${TOOLTIP_ID} .urlPreviewTooltip-favicon {
  width: 14px;
  height: 14px;
  margin-right: 5px;
  flex-shrink: 0;
}
#${TOOLTIP_ID} .urlPreviewTooltip-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 2px;
}
#${TOOLTIP_ID} .urlPreviewTooltip-description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  opacity: 0.85;
}
#${TOOLTIP_ID} .urlPreviewTooltip-loading {
  opacity: 0.7;
  font-style: italic;
}
`

export function attachUrlPreviewTooltip(doc, options) {
  const opts = Object.assign(
    {
      hoverDelay: 450,
      isEnabled: () => true,
      isDark: () => false,
      fetchPreview: null
    },
    options
  )

  let showTimer = null
  let currentAnchor = null
  // Bumped on every hide/new hover so stale fetch callbacks can no-op.
  let token = 0

  function injectStyle() {
    if (doc.getElementById(STYLE_ID) != null) return
    const style = doc.createElement('style')
    style.id = STYLE_ID
    style.appendChild(doc.createTextNode(TOOLTIP_CSS))
    doc.head.appendChild(style)
  }

  function getTooltip() {
    let el = doc.getElementById(TOOLTIP_ID)
    if (el == null) {
      el = doc.createElement('div')
      el.id = TOOLTIP_ID
      doc.body.appendChild(el)
    }
    return el
  }

  function hide() {
    token++
    clearTimeout(showTimer)
    currentAnchor = null
    const el = doc.getElementById(TOOLTIP_ID)
    if (el != null) el.classList.remove('urlPreviewTooltip--visible')
  }

  function position(el, anchor) {
    const rect = anchor.getBoundingClientRect()
    const body = doc.body
    const viewportWidth = doc.documentElement.clientWidth
    const viewportHeight = doc.documentElement.clientHeight
    const margin = 8
    const gap = 6

    const width = el.offsetWidth
    const height = el.offsetHeight

    let left = rect.left + body.scrollLeft
    const maxLeft = body.scrollLeft + viewportWidth - width - margin
    if (left > maxLeft) left = maxLeft
    if (left < body.scrollLeft + margin) left = body.scrollLeft + margin

    // Below the link by default; flip above when it would overflow the fold.
    let top = rect.bottom + body.scrollTop + gap
    if (
      rect.bottom + gap + height > viewportHeight &&
      rect.top - gap - height > 0
    ) {
      top = rect.top + body.scrollTop - gap - height
    }

    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
  }

  // All text goes in via textContent (never innerHTML): metadata comes from
  // arbitrary external pages and must not be able to inject markup.
  function render(el, data) {
    el.innerHTML = ''
    el.classList.toggle('urlPreviewTooltip--dark', !!opts.isDark())

    if (data.imageUrl != null && isPreviewableUrl(data.imageUrl)) {
      const img = doc.createElement('img')
      img.className = 'urlPreviewTooltip-image'
      img.src = data.imageUrl
      img.onerror = () => img.remove()
      el.appendChild(img)
    }

    const body = doc.createElement('div')
    body.className = 'urlPreviewTooltip-body'

    const site = doc.createElement('div')
    site.className = 'urlPreviewTooltip-site'
    if (data.faviconUrl != null && isPreviewableUrl(data.faviconUrl)) {
      const favicon = doc.createElement('img')
      favicon.className = 'urlPreviewTooltip-favicon'
      favicon.src = data.faviconUrl
      favicon.onerror = () => favicon.remove()
      site.appendChild(favicon)
    }
    const siteLabel = doc.createElement('span')
    siteLabel.textContent = data.siteName || data.domain || data.url
    site.appendChild(siteLabel)
    body.appendChild(site)

    if (data.loading) {
      const loading = doc.createElement('div')
      loading.className = 'urlPreviewTooltip-loading'
      loading.textContent = '…'
      body.appendChild(loading)
    }
    if (data.title) {
      const title = doc.createElement('div')
      title.className = 'urlPreviewTooltip-title'
      title.textContent = data.title
      body.appendChild(title)
    }
    if (data.description) {
      const description = doc.createElement('div')
      description.className = 'urlPreviewTooltip-description'
      description.textContent = data.description
      body.appendChild(description)
    }
    if (!data.loading && !data.title && !data.description) {
      const fallback = doc.createElement('div')
      fallback.className = 'urlPreviewTooltip-description'
      fallback.textContent = data.url
      body.appendChild(fallback)
    }

    el.appendChild(body)
  }

  function show(anchor, href) {
    const myToken = ++token
    injectStyle()
    const el = getTooltip()
    render(el, { url: href, domain: hostOf(href), loading: true })
    el.classList.add('urlPreviewTooltip--visible')
    position(el, anchor)

    opts
      .fetchPreview(href)
      .then(data => {
        if (token !== myToken) return
        const tooltip = getTooltip()
        render(tooltip, data)
        tooltip.classList.add('urlPreviewTooltip--visible')
        position(tooltip, anchor)
        // og:image loads async and grows the card — reclamp once it arrives.
        const img = tooltip.querySelector('.urlPreviewTooltip-image')
        if (img != null) {
          img.onload = () => {
            if (token === myToken) position(tooltip, anchor)
          }
        }
      })
      .catch(() => {
        if (token !== myToken) return
        const tooltip = getTooltip()
        render(tooltip, { url: href, domain: hostOf(href) })
        tooltip.classList.add('urlPreviewTooltip--visible')
        position(tooltip, anchor)
      })
  }

  function hostOf(url) {
    try {
      return new window.URL(url).host
    } catch (e) {
      return url
    }
  }

  function handleMouseOver(e) {
    const target = e.target
    if (target == null || typeof target.closest !== 'function') return
    const tooltipEl = doc.getElementById(TOOLTIP_ID)
    if (tooltipEl != null && tooltipEl.contains(target)) return

    const anchor = target.closest('a[href]')
    if (anchor == null) {
      return
    }
    if (anchor === currentAnchor) return

    const href = anchor.getAttribute('href')
    if (
      typeof opts.fetchPreview !== 'function' ||
      !opts.isEnabled() ||
      !isPreviewableUrl(href)
    ) {
      return
    }

    hide()
    currentAnchor = anchor
    showTimer = setTimeout(() => show(anchor, href), opts.hoverDelay)
  }

  function handleMouseOut(e) {
    if (currentAnchor == null) return
    const to = e.relatedTarget
    const tooltipEl = doc.getElementById(TOOLTIP_ID)
    if (
      to != null &&
      (currentAnchor.contains(to) ||
        (tooltipEl != null && tooltipEl.contains(to)))
    ) {
      return
    }
    hide()
  }

  function handleHide() {
    hide()
  }

  doc.addEventListener('mouseover', handleMouseOver)
  doc.addEventListener('mouseout', handleMouseOut)
  doc.addEventListener('scroll', handleHide, true)
  doc.addEventListener('mousedown', handleHide, true)

  injectStyle()

  return function detach() {
    hide()
    doc.removeEventListener('mouseover', handleMouseOver)
    doc.removeEventListener('mouseout', handleMouseOut)
    doc.removeEventListener('scroll', handleHide, true)
    doc.removeEventListener('mousedown', handleHide, true)
    const el = doc.getElementById(TOOLTIP_ID)
    if (el != null) el.remove()
    const style = doc.getElementById(STYLE_ID)
    if (style != null) style.remove()
  }
}

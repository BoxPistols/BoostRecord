/**
 * @fileoverview プレビューで、段落に単独で置いたYouTubeのリンクをサムネイルにし、
 * 押すとその場でプレーヤーに差し替える。文中のリンクはそのまま残す。
 * ノートの本文は書き換えず、プレビューのDOMだけを変える。素のDOMだけで組む（Electron依存なし）。
 *
 * 埋め込みはyoutube-nocookie.comを使う。file://から開くとRefererが付かず「エラー153」で
 * 再生できないため、mainプロセス（lib/youtubeReferer.js）がRefererを補っている。
 */

export const CARD_CLASS = 'youtubeEmbed'
export const STYLE_ID = 'youtubeEmbedStyle'

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

const EMBED_CSS = `
.${CARD_CLASS} {
  position: relative;
  display: block;
  width: 100%;
  max-width: 640px;
  aspect-ratio: 16 / 9;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 8px;
  overflow: hidden;
  background-color: #000;
  cursor: pointer;
}
.${CARD_CLASS} img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.${CARD_CLASS}-play {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 68px;
  height: 48px;
  margin: -24px 0 0 -34px;
  border-radius: 12px;
  background-color: rgba(18, 18, 18, 0.82);
  transition: background-color 0.15s;
}
.${CARD_CLASS}-play::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  margin: -10px 0 0 -7px;
  border-style: solid;
  border-width: 10px 0 10px 17px;
  border-color: transparent transparent transparent #fff;
}
.${CARD_CLASS}:hover .${CARD_CLASS}-play,
.${CARD_CLASS}:focus-visible .${CARD_CLASS}-play {
  background-color: #e62117;
}
.${CARD_CLASS}:focus-visible {
  outline: 2px solid #4e7ea8;
  outline-offset: 2px;
}
.${CARD_CLASS} iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
}
.${CARD_CLASS}-link {
  display: inline-block;
  margin-top: 6px;
  font-size: 13px;
}
`

/**
 * YouTubeのURLから動画IDと開始位置を取り出す。共有URLに付く追跡用のsiなどは捨てる
 * @param {string} href
 * @returns {{id: string, start: number}|null}
 */
export function parseYouTubeUrl(href) {
  let url
  try {
    url = new URL(href)
  } catch (e) {
    return null
  }
  if (!/^https?:$/.test(url.protocol)) return null
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '')
  let id = null
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0]
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      id = url.searchParams.get('v')
    } else {
      const m = /^\/(?:shorts|embed|live|v)\/([^/]+)/.exec(url.pathname)
      id = m ? m[1] : null
    }
  }
  if (!id || !ID_PATTERN.test(id)) return null
  return {
    id,
    start: parseStart(
      url.searchParams.get('t') || url.searchParams.get('start')
    )
  }
}

// t=90 / t=90s / t=1m30s / t=1h2m3s を秒にする
function parseStart(value) {
  if (!value) return 0
  if (/^\d+$/.test(value)) return parseInt(value, 10)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (!m) return 0
  return (
    parseInt(m[1] || 0, 10) * 3600 +
    parseInt(m[2] || 0, 10) * 60 +
    parseInt(m[3] || 0, 10)
  )
}

export function thumbnailUrl(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

export function embedUrl(id, start) {
  const params = ['autoplay=1', 'rel=0']
  if (start > 0) params.push(`start=${start}`)
  return `https://www.youtube-nocookie.com/embed/${id}?${params.join('&')}`
}

// 段落の中身がこのリンク1つだけか（前後の空白は除く）
function standsAlone(a) {
  const p = a.parentElement
  if (!p || p.tagName !== 'P') return false
  return Array.from(p.childNodes).every(
    node => node === a || (node.nodeType === 3 && node.nodeValue.trim() === '')
  )
}

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = EMBED_CSS
  doc.head.appendChild(style)
}

/**
 * 段落に単独で置いたYouTubeのリンクを、サムネイルとリンクに置き換える
 * @param {Document} doc プレビューのdocument
 * @param {Object} options
 * @param {string} options.playLabel 再生ボタンの読み上げ名（%sに動画のリンク文字列）
 * @param {string} options.openLabel YouTubeで開くリンクの文字列
 * @param {Function} [options.onLinkCreated] 作ったリンクに外部で開く処理を付ける
 * @returns {number} 置き換えた数
 */
export function hydrateYouTubeLinks(doc, options) {
  const links = Array.from(doc.querySelectorAll('p > a[href]')).filter(
    a => standsAlone(a) && parseYouTubeUrl(a.getAttribute('href'))
  )
  if (links.length === 0) return 0
  ensureStyle(doc)
  links.forEach(a => {
    const href = a.getAttribute('href')
    const { id, start } = parseYouTubeUrl(href)
    const label = a.textContent.trim() || href

    const card = doc.createElement('button')
    card.type = 'button'
    card.className = CARD_CLASS
    card.setAttribute('aria-label', options.playLabel.replace('%s', label))
    const img = doc.createElement('img')
    img.src = thumbnailUrl(id)
    img.alt = ''
    img.loading = 'lazy'
    const play = doc.createElement('span')
    play.className = `${CARD_CLASS}-play`
    card.appendChild(img)
    card.appendChild(play)
    // 押したときだけプレーヤーを読み込む。開いただけでは動画側へ通信しない
    card.addEventListener('click', () => {
      const frame = doc.createElement('iframe')
      frame.src = embedUrl(id, start)
      frame.title = label
      frame.setAttribute(
        'allow',
        'autoplay; encrypted-media; picture-in-picture; fullscreen'
      )
      frame.setAttribute('allowfullscreen', '')
      const wrap = doc.createElement('div')
      wrap.className = CARD_CLASS
      wrap.appendChild(frame)
      card.replaceWith(wrap)
    })

    const link = doc.createElement('a')
    link.href = href
    link.className = `${CARD_CLASS}-link`
    link.textContent = options.openLabel
    if (options.onLinkCreated) options.onLinkCreated(link)

    const p = a.parentElement
    p.textContent = ''
    p.appendChild(card)
    p.appendChild(doc.createElement('br'))
    p.appendChild(link)
  })
  return links.length
}

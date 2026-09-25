// YouTubeの埋め込みプレーヤーは、Refererの無い読み込みを「エラー153」で拒む。
// アプリはfile://から開くのでRefererが付かない。埋め込みの通信にだけ、
// Refererが無いときに限ってYouTube自身のアドレスを補う（ほかの通信には触らない）
const EMBED_URLS = ['https://www.youtube-nocookie.com/*']
const REFERER = 'https://www.youtube-nocookie.com/'

/**
 * @param {Object} headers requestHeaders
 * @returns {Object} Refererを補ったheaders（あればそのまま）
 */
function withReferer(headers) {
  const has = Object.keys(headers || {}).some(
    k => k.toLowerCase() === 'referer'
  )
  return has ? headers : Object.assign({}, headers, { Referer: REFERER })
}

function registerYouTubeReferer(session) {
  session.webRequest.onBeforeSendHeaders(
    { urls: EMBED_URLS },
    (details, cb) => {
      cb({ requestHeaders: withReferer(details.requestHeaders) })
    }
  )
}

module.exports = { registerYouTubeReferer, withReferer, EMBED_URLS }

// BoostRecord Web の Service Worker。オフラインで開けるようにするだけで、ノートには触らない
// （ノートは OPFS にあり、ネットワークを通らない）。
//
// 決まり:
//   - ページ（HTML）は、オンラインのときは横取りしない。ブラウザがそのまま取りに行くので、
//     デプロイした新しい版がすぐ出る。古いキャッシュで直したはずの不具合が残ることがない。
//     Basic 認証の入力欄もブラウザが普段どおり出す
//   - オフラインのときだけ、最後に開いた版の HTML を返す
//   - /assets/（名前に内容のハッシュが入る）と /icons/ はキャッシュを先に見る
//   - ページが開いたら（shell メッセージ）、ビルドが書き出した /sw-assets.json の一覧を
//     まとめてキャッシュする。後から読む KaTeX のフォントなども入る。一覧に無い古い /assets/ は消す
const CACHE = 'boostrecord-shell-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })()
  )
})

self.addEventListener('message', event => {
  const data = event.data
  if (!data || data.type !== 'shell') return
  event.waitUntil(cacheShell())
})

// 認証が要る・失敗した応答はしまわない（401 の画面をオフラインで出さない）
async function fetchOk(path, init) {
  const res = await fetch(path, { credentials: 'same-origin', ...init }).catch(() => null)
  return res && res.ok ? res : null
}

async function cacheShell() {
  const list = await fetchOk('/sw-assets.json', { cache: 'no-cache' })
  if (!list) return
  // 途中で切れた応答などで読めなければ、今のキャッシュを残して何もしない
  const assets = await list.json().catch(() => null)
  if (!Array.isArray(assets) || !assets.every(p => typeof p === 'string' && p.startsWith('/assets/'))) return
  const cache = await caches.open(CACHE)
  const html = await fetchOk('/', { cache: 'no-cache' })
  if (html) await cache.put('/', html)
  const keep = new Set(assets)
  for (const path of assets) {
    if (await cache.match(path)) continue
    const res = await fetchOk(path)
    if (res) await cache.put(path, res)
  }
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname
    if (path.startsWith('/assets/') && !keep.has(path)) await cache.delete(req)
  }
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    if (self.navigator.onLine) return
    event.respondWith(caches.match('/').then(res => res || fetch(req)))
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(url.pathname).then(
        hit =>
          hit ||
          fetch(req).then(async res => {
            if (res.ok) (await caches.open(CACHE)).put(url.pathname, res.clone())
            return res
          })
      )
    )
  }
})

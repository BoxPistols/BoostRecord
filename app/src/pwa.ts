// PWA（ホーム画面に追加・オフライン起動）。Service Worker を登録し、開くたびに
// 今の版のファイルをキャッシュさせる（一覧はビルドが /sw-assets.json に書き出す）。デスクトップ版（Electron）と開発中のサーバーでは登録しない
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || window.boostnote || import.meta.env.DEV) return
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const reg = await navigator.serviceWorker.ready
      reg.active?.postMessage({ type: 'shell' })
    } catch {
      // 登録できなくても、オンラインではそのまま使える
    }
  })
}

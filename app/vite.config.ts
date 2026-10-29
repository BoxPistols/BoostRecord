import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Service Worker がオフライン用にキャッシュするファイルの一覧（public/sw.js が読む）。
// 後から読み込むチャンクや KaTeX のフォントも、ビルドが出したものはすべて入れる
function swAssets(): Plugin {
  return {
    name: 'sw-assets',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter(f => f.startsWith('assets/'))
        // KaTeX のフォントは woff2 / woff / ttf の 3 形式が出るが、対象のブラウザはすべて woff2 を使う
        .filter(f => !/\.(woff|ttf)$/.test(f))
        .map(f => `/${f}`)
        .sort()
      this.emitFile({ type: 'asset', fileName: 'sw-assets.json', source: JSON.stringify(files) })
    }
  }
}

// base: './' makes built asset URLs relative, which is required when Electron
// loads dist/index.html over file:// in the packaged app.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), swAssets()]
})

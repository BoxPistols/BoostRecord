// Touch Bar 用の単色グリフ PNG を生成する。
//
//   npm run build:touchbar-icons
//
// 入力  dev-scripts/touchbar-icons/*.svg  （24×24 の線画。ここが原盤）
// 出力  resources/touchbar/<name>.png      （18×18 = @1x）
//       resources/touchbar/<name>@2x.png   （36×36）
//
// 出力 PNG はリポジトリにコミットする。生成には Electron が要るので、
// SVG を触った人だけがこのスクリプトを回せばよく、CI や他の開発者に
// 描画ツールの導入を強いない。
//
// なぜ Chromium で描くか: ImageMagick は librsvg 無しでは SVG を描画せず
// （空 PNG になる）、qlmanage は透過を落とす。実測で両方失格だった。
// Chromium なら canvas の alpha がそのまま取れる。
//
// template image は alpha しか見ないので、描画後に source-in で純黒へ
// 塗り潰す。これで SVG 側の stroke 色に関係なく template として正しくなる。
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const SRC_DIR = path.join(__dirname, 'touchbar-icons')
const OUT_DIR = path.join(__dirname, '..', 'resources', 'touchbar')
// @1x は Touch Bar の論理サイズ（バー高 30pt に対しグリフ 18pt）
const SIZES = [
  { suffix: '', px: 18 },
  { suffix: '@2x', px: 36 }
]

function renderInPage(svg, px) {
  // ページ側で実行される。SVG → <img> → canvas → PNG dataURL
  return `(async () => {
    const svg = ${JSON.stringify(svg)}
    const img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    await img.decode()
    const c = document.createElement('canvas')
    c.width = ${px}
    c.height = ${px}
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, ${px}, ${px})
    // alpha を残したまま純黒へ（template image は alpha のみ使う）
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, ${px}, ${px})
    return c.toDataURL('image/png')
  })()`
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) throw new Error('no source dir: ' + SRC_DIR)
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const names = fs
    .readdirSync(SRC_DIR)
    .filter(f => f.endsWith('.svg'))
    .map(f => f.replace(/\.svg$/, ''))
    .sort()
  if (!names.length) throw new Error('no .svg in ' + SRC_DIR)

  const win = new BrowserWindow({
    show: false, // 前面化はユーザーの作業を奪うので出さない
    width: 64,
    height: 64,
    webPreferences: { offscreen: false }
  })
  await win.loadURL('data:text/html,<html><body></body></html>')

  const written = []
  for (const name of names) {
    const svg = fs.readFileSync(path.join(SRC_DIR, name + '.svg'), 'utf8')
    for (const { suffix, px } of SIZES) {
      const dataUrl = await win.webContents.executeJavaScript(
        renderInPage(svg, px),
        true
      )
      const b64 = String(dataUrl).replace(/^data:image\/png;base64,/, '')
      if (!b64 || b64 === String(dataUrl)) {
        throw new Error('unexpected canvas output for ' + name + suffix)
      }
      const buf = Buffer.from(b64, 'base64')
      // 全面透明（＝描画されていない）を黙って通さない
      if (buf.length < 100) {
        throw new Error('suspiciously small png for ' + name + suffix)
      }
      const out = path.join(OUT_DIR, name + suffix + '.png')
      fs.writeFileSync(out, buf)
      written.push({ file: path.basename(out), bytes: buf.length, px })
    }
  }

  win.destroy()
  console.log('=== touch bar icons ===')
  written.forEach(w =>
    console.log(
      `  ${w.file.padEnd(20)} ${String(w.px).padStart(3)}px  ${w.bytes}B`
    )
  )
  console.log(
    `--- ${written.length} files -> ${path.relative(process.cwd(), OUT_DIR)}`
  )
}

app.whenReady().then(() =>
  main().then(
    () => app.exit(0),
    err => {
      console.error('FAILED:', err && err.message ? err.message : err)
      app.exit(1)
    }
  )
)

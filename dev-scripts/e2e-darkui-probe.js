// ダークテーマで「背景が白いUI」が残っていないかを実描画で見る。
//
// CSS の grep では見つからない。react-color の SketchPicker のように
// **インラインスタイルで白を焼き込んでいる**サードパーティ製の UI は
// styl を何度読んでも出てこないため、実際に開いてスクリーンショットと
// 実測値（computed style）の両方を取る。
//
// 右クリックメニューは remote 経由で main 側に Menu を作るので、
// main で Menu.prototype.popup を差し替えれば「出さずに掴む」ことができ、
// 目的の項目を click() で叩ける（ネイティブメニューは画面に出ると
// キャプチャできないうえ、閉じるまで先へ進めない）。
const { app, Menu } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-darkui.json')
const SHOT_DIR = process.env.TB_E2E_SHOTS || path.join(os.tmpdir(), 'tb-darkui')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-darkui-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'dfolder', name: 'Notes', color: '#E10051' }],
    version: '1.0'
  })
)
// タグを1つ持つノート（タグの色ピッカーを開くのに要る）
fs.writeFileSync(
  path.join(storageDir, 'notes', 'darkui-1.cson'),
  [
    'createdAt: "2026-01-01T00:00:00.000Z"',
    'updatedAt: "2026-01-01T00:00:00.000Z"',
    'type: "MARKDOWN_NOTE"',
    'folder: "dfolder"',
    'title: "Dark UI"',
    'tags: [ "sample" ]',
    'isStarred: false',
    'isTrashed: false',
    'content: "# Dark UI"'
  ].join('\n')
)
app.setPath('userData', path.join(tmpRoot, 'userData'))
app.setPath('home', tmpRoot)

const rows = []
let finished = false
let ran = false
function finish(code, result) {
  if (finished) return
  finished = true
  console.log('\n=== dark UI probe ===')
  rows.forEach(r => console.log(`ROW   ${r.label} — ${JSON.stringify(r.data)}`))
  if (result && result.verdict) console.log(`\nVERDICT: ${result.verdict}`)
  if (result && result.error) console.log(`ERROR: ${result.error}`)
  console.log(`SHOTS: ${SHOT_DIR}`)
  console.log(`--- exit ${code}`)
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, rows, result }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 120000)

// --- 右クリックメニューを「出さずに掴む」 ---
let lastMenu = null
const origPopup = Menu.prototype.popup
Menu.prototype.popup = function(...args) {
  lastMenu = this
  // 実際には出さない（出すとキャプチャできず、閉じるまで進めない）
  return undefined
}
// 使わないが、差し替えたことを明示しておく
void origPopup

function findItem(menu, labels) {
  if (!menu) return null
  const wanted = [].concat(labels)
  for (const item of menu.items) {
    if (wanted.indexOf(item.label) !== -1) return item
    if (item.submenu) {
      const found = findItem(item.submenu, wanted)
      if (found) return found
    }
  }
  return null
}

function seed() {
  return `(() => {
    if (localStorage.getItem('__darkuiSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    let cfg = {}
    try { cfg = JSON.parse(localStorage.getItem('config')) || {} } catch (e) {}
    cfg.ui = Object.assign({}, cfg.ui, { theme: 'dark' })
    localStorage.setItem('config', JSON.stringify(cfg))
    localStorage.setItem('__darkuiSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

// 明るさ（0-255）。白い面が残っていれば大きな値になる
const LUMA = `(sel) => {
  const el = document.querySelector(sel)
  if (!el) return null
  const cs = getComputedStyle(el)
  const m = cs.backgroundColor.match(/[\\d.]+/g)
  if (!m) return { color: cs.backgroundColor, luma: null }
  const [r, g, b, a] = m.map(Number)
  return {
    color: cs.backgroundColor,
    alpha: a === undefined ? 1 : a,
    luma: Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
  }
}`

async function shoot(win, name) {
  const img = await win.webContents.capturePage()
  const file = path.join(SHOT_DIR, `${name}.png`)
  fs.writeFileSync(file, img.toPNG())
  return file
}

app.on('browser-window-created', (_e, win) => {
  if (ran) return
  ran = true
  const wc = win.webContents
  // 例外が出ていると「開かない」だけが見えて原因が分からない
  const consoleErrors = []
  wc.on('console-message', (_ev, level, message) => {
    if (level >= 2) consoleErrors.push(message.slice(0, 200))
  })
  wc.on('did-finish-load', async () => {
    try {
      if (finished) return
      const seeded = await wc.executeJavaScript(seed(), true)
      if (!seeded) return
      await new Promise(resolve => setTimeout(resolve, 2500))

      rows.push({
        label: 'sidenav dom',
        data: await wc.executeJavaScript(
          `(() => {
            const nav = document.querySelector('.SideNav')
            if (!nav) return 'no SideNav'
            return Array.from(nav.querySelectorAll('button')).slice(0, 24).map(b =>
              b.className + '|' + (b.textContent || '').trim().slice(0, 12)
            )
          })()`,
          true
        )
      })

      rows.push({
        label: 'theme',
        data: await wc.executeJavaScript(
          `document.body.getAttribute('data-theme')`,
          true
        )
      })

      // --- 1. フォルダ名の変更モーダル（選択中テキストが読めるか） ---
      const opened = await wc.executeJavaScript(
        `(() => {
          const el = document.querySelector('.SideNav button[class*="folderList-item"]')
          if (!el) return false
          el.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, clientX:120, clientY:200}))
          return true
        })()`,
        true
      )
      rows.push({ label: 'folder context menu', data: { dispatched: opened } })
      const rename = findItem(lastMenu, ['Rename Folder', 'フォルダの名称変更'])
      rows.push({ label: 'Rename Folder item', data: { found: !!rename } })
      if (rename) {
        rename.click(rename, win, {})
        await new Promise(resolve => setTimeout(resolve, 700))
        // 実際の利用時と同じく、入力欄の文字は選択された状態にする
        await wc.executeJavaScript(
          `(() => {
            const i = document.querySelector('.ModalBase input')
            if (i) { i.focus(); i.select() }
            return !!i
          })()`,
          true
        )
        await new Promise(resolve => setTimeout(resolve, 300))
        rows.push({
          label: 'modal dom',
          data: await wc.executeJavaScript(
            `(() => {
              const root = document.querySelector('.ModalBase')
              if (!root) return 'no ModalBase'
              return Array.from(root.querySelectorAll('*'))
                .slice(0, 30)
                .map(el => {
                  const cs = getComputedStyle(el)
                  return el.tagName + '.' + (el.className || '').toString().slice(0, 22) +
                    ' bg=' + cs.backgroundColor + ' color=' + cs.color
                })
            })()`,
            true
          )
        })
        rows.push({
          label: 'rename modal bg',
          data: await wc.executeJavaScript(
            `(${LUMA})('.ModalBase [class*="RenameModal"], .ModalBase > div > div')`,
            true
          )
        })
        rows.push({
          label: 'shot: rename modal',
          data: await shoot(win, '1-rename-modal-dark')
        })
        await wc.executeJavaScript(
          `(() => { const b=document.querySelector('.ModalBase [class*="ModalEscButton"], .ModalBase button'); if(b) b.click(); return true })()`,
          true
        )
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // --- 2. タグの色ピッカー（react-color / インラインスタイルで白） ---
      lastMenu = null
      // タグは別タブ。先に「タグ」へ切り替えないと一覧が描画されない
      await wc.executeJavaScript(
        `(() => {
          const b = Array.from(document.querySelectorAll('.SideNav button'))
            .find(x => (x.textContent || '').trim() === 'タグ' ||
                       (x.textContent || '').trim() === 'Tags')
          if (b) b.click()
          return !!b
        })()`,
        true
      )
      await new Promise(resolve => setTimeout(resolve, 600))
      const tagOpened = await wc.executeJavaScript(
        `(() => {
          const el = document.querySelector('.SideNav button[class*="tagList"], .SideNav [class*="tagList"] button')
          if (!el) return false
          el.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, clientX:120, clientY:400}))
          return true
        })()`,
        true
      )
      rows.push({ label: 'tag context menu', data: { dispatched: tagOpened } })
      rows.push({
        label: 'tag buttons',
        data: await wc.executeJavaScript(
          `(() => Array.from(document.querySelectorAll('.SideNav button'))
             .map(b => b.className + '|' + (b.textContent||'').trim().slice(0,10))
             .slice(0, 20))()`,
          true
        )
      })
      const colorItem = findItem(lastMenu, ['Customize Color', '色を変更'])
      rows.push({ label: 'Customize Color item', data: { found: !!colorItem } })
      if (colorItem) {
        colorItem.click(colorItem, win, {})
        await new Promise(resolve => setTimeout(resolve, 700))
        rows.push({
          label: 'picker dom',
          data: await wc.executeJavaScript(
            `(() => {
              const root = document.querySelector('[data-folder-color-popover]')
              if (!root) return 'no color popover'
              return Array.from(root.querySelectorAll('*'))
                .slice(0, 40)
                .map(el => {
                  const bg = getComputedStyle(el).backgroundColor
                  return el.tagName + '.' + (el.className || '').toString().slice(0, 18) + '=' + bg
                })
                .filter(x => !/rgba\(0, 0, 0, 0\)/.test(x))
            })()`,
            true
          )
        })
        rows.push({
          label: 'tag color popover bg',
          data: await wc.executeJavaScript(
            `(${LUMA})('[data-folder-color-popover]')`,
            true
          )
        })
        rows.push({
          label: 'shot: tag color picker',
          data: await shoot(win, '2-tag-color-picker-dark')
        })
      }

      // エディタは UI と別テーマ系統。ここだけ白い柱で残るのが
      // 「ダークなのに白いUI」の正体だった
      rows.push({
        label: 'editor bg',
        data: await wc.executeJavaScript(`(${LUMA})('.CodeMirror')`, true)
      })
      rows.push({
        label: 'shot: whole window',
        data: await shoot(win, '3-window-dark')
      })

      rows.push({ label: 'console errors', data: consoleErrors.slice(-6) })

      // 開けなかった項目を「白は無かった」と読み替えない。
      // 測れていないのに緑になるプローブは、あっても無いのと同じ
      const missing = rows
        .filter(r => r.data && r.data.found === false)
        .map(r => r.label)
      const bgRows = rows.filter(
        r => r.label.endsWith(' bg') && r.data && r.data.luma != null
      )
      const bright = bgRows.filter(r => r.data.luma > 200)
      const ok = missing.length === 0 && bright.length === 0
      finish(ok ? 0 : 1, {
        verdict: missing.length
          ? `開けなかった: ${missing.join(', ')}（判定不能）`
          : bright.length
          ? `明るい背景が残っている: ${bright
              .map(r => `${r.label}=${r.data.color}`)
              .join(', ')}`
          : `ダークテーマで白背景なし（測定 ${bgRows.length} 箇所）`
      })
    } catch (err) {
      finish(4, { error: String((err && err.message) || err) })
    }
  })
})

app.on('window-all-closed', () => finish(finished ? 0 : 5, {}))

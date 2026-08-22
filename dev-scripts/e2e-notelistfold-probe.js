// Cmd+Shift+B（ノート一覧の折りたたみ）が実際にどれだけ縮めるかを測る。
// 「少ししか閉じない」という報告の裏取り。
const { app, Menu, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-notelistfold.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-nlfold-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'nfolder', name: 'Notes', color: '#E10051' }],
    version: '1.0'
  })
)
app.setPath('userData', path.join(tmpRoot, 'userData'))
app.setPath('home', tmpRoot)

const rows = []
let finished = false
let ran = false
function finish(code, result) {
  if (finished) return
  finished = true
  console.log('\n=== note list fold probe ===')
  rows.forEach(r => console.log(`ROW   ${r.label} — ${JSON.stringify(r.data)}`))
  if (result && result.verdict) console.log(`\nVERDICT: ${result.verdict}`)
  if (result && result.error) console.log(`ERROR: ${result.error}`)
  console.log(`--- exit ${code}`)
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, rows, result }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 90000)

function seed() {
  return `(() => {
    if (localStorage.getItem('__nlFoldSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__nlFoldSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

const MEASURE = `(() => {
  const list = document.querySelector('.NoteList')
  const detail = document.querySelector('.NoteDetail')
  const r = list ? list.getBoundingClientRect() : null
  const d = detail ? detail.getBoundingClientRect() : null
  let cfg = {}
  try { cfg = JSON.parse(localStorage.getItem('config')) || {} } catch (e) {}
  return {
    listWidth: r ? Math.round(r.width) : null,
    listDisplay: list ? getComputedStyle(list).display : null,
    detailLeft: d ? Math.round(d.x) : null,
    isNoteListFolded: !!cfg.isNoteListFolded,
    noteListMode: cfg.noteListMode,
    trace: window.__tbNoteListMode,
    foldedListWidth: cfg.foldedListWidth,
    configListWidth: cfg.listWidth
  }
})()`

function findItem(menu, label) {
  if (!menu) return null
  for (const item of menu.items) {
    if (item.label === label) return item
    if (item.submenu) {
      const f = findItem(item.submenu, label)
      if (f) return f
    }
  }
  return null
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true
        const win = BrowserWindow.getAllWindows()[0]
        await wc.executeJavaScript(
          `(async () => { const s = ms => new Promise(r => setTimeout(r, ms))
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.NoteList')) break; await s(250) }
             return true })()`,
          true
        )

        rows.push({
          label: '初期',
          data: await wc.executeJavaScript(MEASURE, true)
        })

        const menu = Menu.getApplicationMenu()
        const item = findItem(menu, 'Toggle Note List')
        rows.push({
          label: 'menu item',
          data: { found: !!item, accel: item ? String(item.accelerator) : null }
        })
        if (!item) return finish(2, { error: 'Toggle Note List not found' })

        item.click(item, win, {})
        await new Promise(resolve => setTimeout(resolve, 800))
        const folded = await wc.executeJavaScript(MEASURE, true)
        rows.push({ label: '1回目（畳む）', data: folded })

        item.click(item, win, {})
        await new Promise(resolve => setTimeout(resolve, 800))
        const hidden = await wc.executeJavaScript(MEASURE, true)
        rows.push({ label: '2回目（完全に閉じる）', data: hidden })

        // 隠すと中の折りたたみボタンも消えるので、戻る導線が要る
        const reopen = await wc.executeJavaScript(
          `(() => !!document.querySelector('.TopBar button i.fa-list'))()`,
          true
        )
        rows.push({ label: '再表示ボタン', data: { shown: reopen } })

        item.click(item, win, {})
        await new Promise(resolve => setTimeout(resolve, 800))
        const restored = await wc.executeJavaScript(MEASURE, true)
        rows.push({ label: '3回目（戻る）', data: restored })

        const before = rows.find(r => r.label === '初期').data
        const ok =
          folded.listWidth === 100 &&
          hidden.listWidth === 0 &&
          hidden.listDisplay === 'none' &&
          restored.listWidth === before.listWidth &&
          reopen
        finish(ok ? 0 : 1, {
          verdict: `${before.listWidth} → ${folded.listWidth} → ${hidden.listWidth}(${hidden.listDisplay}) → ${restored.listWidth} / 再表示ボタン ${reopen}`
        })
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

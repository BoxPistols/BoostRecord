// Real-renderer probe for the "Cmd+B / Toggle Side Bar does nothing" report.
// Launches the real app, finds the actual View-menu "Toggle Side Bar" item
// (accelerator Cmd/Ctrl+B), clicks it, and measures whether the .SideNav width
// actually flips (expanded ~240px <-> folded 44px). Proves the full chain:
// menu click -> webContents.send('sidenav:togglesidenav') -> ipcRenderer.on in
// SideNav -> handleToggleButtonClick -> SET_IS_SIDENAV_FOLDED -> re-render.
const { app, Menu, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-sidebar-result.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-sidebar-'))
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

let finished = false
let ran = false
function finish(code, result) {
  if (finished) return
  finished = true
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, result }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 90000)

function findMenuItem(menu, label) {
  if (!menu) return null
  for (const item of menu.items) {
    if (item.label === label) return item
    if (item.submenu) {
      const found = findMenuItem(item.submenu, label)
      if (found) return found
    }
  }
  return null
}

function seed() {
  return `(() => { let l=[]; try{l=JSON.parse(localStorage.getItem('storages'))||[]}catch(e){}
    if(!Array.isArray(l)||!l.length){localStorage.setItem('storages',JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]));setTimeout(()=>location.reload(),50);return false} return true })()`
}

function measureWidth() {
  return `(() => { const el = document.querySelector('.SideNav'); return el ? Math.round(el.getBoundingClientRect().width) : -1 })()`
}

function waitReady() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
    return !!document.querySelector('.SideNav')
  })()`
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true

        const rep = { steps: [] }
        const ready = await wc.executeJavaScript(waitReady(), true)
        rep.uiReady = ready
        if (!ready)
          return finish(1, { ok: false, rep, error: 'SideNav never mounted' })

        const menu = Menu.getApplicationMenu()
        const item = findMenuItem(menu, 'Toggle Side Bar')
        rep.menuItemFound = !!item
        rep.accelerator = item ? String(item.accelerator) : null
        if (!item)
          return finish(1, {
            ok: false,
            rep,
            error: 'Toggle Side Bar menu item not found'
          })

        const win = BrowserWindow.getAllWindows()[0]

        const w0 = await wc.executeJavaScript(measureWidth(), true)
        rep.widthInitial = w0

        // Click the real menu item (same code path as pressing Cmd+B).
        item.click(item, win, {})
        await new Promise(resolve => setTimeout(resolve, 700))
        const w1 = await wc.executeJavaScript(measureWidth(), true)
        rep.widthAfterToggle1 = w1

        item.click(item, win, {})
        await new Promise(resolve => setTimeout(resolve, 700))
        const w2 = await wc.executeJavaScript(measureWidth(), true)
        rep.widthAfterToggle2 = w2

        const toggled = w1 !== w0 && w1 > 0 && w0 > 0
        const restored = w2 === w0
        rep.toggledOnFirstClick = toggled
        rep.restoredOnSecondClick = restored
        const ok = toggled && restored
        finish(ok ? 0 : 1, { ok, rep })
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

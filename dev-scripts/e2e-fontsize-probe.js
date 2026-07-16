// Real-renderer probe for the editor-header font-size control (app-wide zoom).
// Seeds a markdown note, opens it, clicks the header "Increase font size"
// button and verifies the webFrame zoom factor actually grows, then "Reset"
// returns it to 1.0. Proves FontSizeControl -> ZoomManager.setZoom() works.
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-fontsize-result.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-fontsize-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'nfolder', name: 'Notes', color: '#E10051' }],
    version: '1.0'
  })
)
// Seed one markdown note (CSON) so a note-detail (with the header) can open.
fs.writeFileSync(
  path.join(storageDir, 'notes', 'zoomtest0.cson'),
  [
    'createdAt: "2026-01-01T00:00:00.000Z"',
    'updatedAt: "2026-01-01T00:00:00.000Z"',
    'type: "MARKDOWN_NOTE"',
    'folder: "nfolder"',
    'title: "Zoom Test Note"',
    'tags: []',
    'isStarred: false',
    'isTrashed: false',
    'content: "# Zoom Test Note"',
    ''
  ].join('\n')
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

function seed() {
  return `(() => { let l=[]; try{l=JSON.parse(localStorage.getItem('storages'))||[]}catch(e){}
    if(!Array.isArray(l)||!l.length){localStorage.setItem('storages',JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]));setTimeout(()=>location.reload(),50);return false} return true })()`
}

function driver() {
  return `(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
    const rep = { steps: [] }
    try {
      for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.getElementById('content')) break; await sleep(250) }
      rep.steps.push('ui-ready')

      // Click the seeded note in the list to open its detail (header w/ control).
      let opened = false
      for (let i=0;i<40;i++){
        const hit = Array.from(document.querySelectorAll('div,span,li,a')).find(el => (el.textContent||'').trim() === 'Zoom Test Note')
        if (hit) { let n = hit; for (let d=0; d<4 && n; d++){ n.click(); n = n.parentElement } opened = true; break }
        await sleep(250)
      }
      rep.noteOpened = opened
      // wait for the FontSizeControl to render
      let incBtn = null
      for (let i=0;i<40;i++){
        incBtn = Array.from(document.querySelectorAll('button')).find(b => /Increase font size|文字サイズを拡大/.test(b.getAttribute('aria-label')||''))
        if (incBtn) break
        await sleep(250)
      }
      rep.controlFound = !!incBtn
      if (!incBtn) return { ok:false, rep, error:'FontSizeControl not found in header' }

      const remote = require('@electron/remote')
      const getZoom = () => remote.getCurrentWebContents().getZoomFactor()

      // normalize to 100% first via the reset button
      const resetBtn = Array.from(document.querySelectorAll('button')).find(b => /Reset font size|文字サイズをリセット/.test(b.getAttribute('aria-label')||''))
      if (resetBtn) { resetBtn.click(); await sleep(300) }
      rep.zoomBefore = getZoom()

      incBtn.click(); await sleep(300)
      incBtn.click(); await sleep(300)
      rep.zoomAfterIncrease = getZoom()

      const decBtn = Array.from(document.querySelectorAll('button')).find(b => /Decrease font size|文字サイズを縮小/.test(b.getAttribute('aria-label')||''))
      decBtn.click(); await sleep(300)
      rep.zoomAfterDecrease = getZoom()

      if (resetBtn) { resetBtn.click(); await sleep(300) }
      rep.zoomAfterReset = getZoom()

      const increased = rep.zoomAfterIncrease > rep.zoomBefore + 0.05
      const decreased = rep.zoomAfterDecrease < rep.zoomAfterIncrease - 0.05
      const reset = Math.abs(rep.zoomAfterReset - 1) < 0.01
      rep.increased = increased; rep.decreased = decreased; rep.reset = reset
      return { ok: increased && decreased && reset, rep }
    } catch (err) { return { ok:false, rep, error:String(err && (err.stack||err.message) || err) } }
  })()`
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true
        const r = await wc.executeJavaScript(driver(), true)
        finish(r && r.ok ? 0 : 1, r)
      } catch (err) {
        finish(2, { error: 'exec failed: ' + err.message })
      }
    }, 4000)
  })
})

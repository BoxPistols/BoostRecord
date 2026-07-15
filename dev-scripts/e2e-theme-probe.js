// Diagnostic probe for the "interface theme switch does nothing" bug.
// Drives the real Preferences → Interface flow: open modal, switch to the UI
// tab, change the theme <select>, click Save, and report whether body's
// data-theme actually changes (+ any thrown error).
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-theme-result.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-theme-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'themefolder', name: 'T', color: '#E10051' }],
    version: '1.0'
  })
)
app.setPath('userData', path.join(tmpRoot, 'userData'))
app.setPath('home', tmpRoot)

const consoleLogs = []
let finished = false
let ran = false
function finish(code, result) {
  if (finished) return
  finished = true
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, result, consoleLogs }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 90000)

function seed() {
  return `(() => { let l=[]; try{l=JSON.parse(localStorage.getItem('storages'))||[]}catch(e){}
    if(!Array.isArray(l)||!l.length){localStorage.setItem('storages',JSON.stringify([{key:'ts',name:'T',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]));setTimeout(()=>location.reload(),50);return false} return true })()`
}

function driver() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const rep = { steps: [] }
    try {
      window.__err = []
      window.addEventListener('error', e => window.__err.push(String((e.error&&(e.error.stack||e.error.message))||e.message)))
      const origErr = console.error
      console.error = (...a) => { window.__err.push('console.error: ' + a.map(String).join(' ').slice(0,300)); origErr.apply(console, a) }

      for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.getElementById('content') && document.getElementById('content').children.length>0) break; await sleep(250) }
      rep.steps.push('ui-ready')

      // open Preferences (button with the settings icon)
      const prefBtn = Array.from(document.querySelectorAll('button')).find(b => {
        const img = b.querySelector('img'); return img && /setting/i.test(img.getAttribute('src')||'')
      })
      rep.prefBtnFound = !!prefBtn
      if (!prefBtn) return { ok:false, rep, error:'preference button not found' }
      prefBtn.click(); await sleep(700)

      // switch to Interface (UI) tab
      const uiTab = Array.from(document.querySelectorAll('button')).find(b => /interface|インターフェース/i.test(b.textContent||''))
      rep.uiTabFound = !!uiTab
      if (uiTab) { uiTab.click(); await sleep(600) }

      // find the theme <select> (options include known theme names)
      const sel = Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o => /rockabilly|dracula|monokai/i.test((o.value||'') + (o.textContent||''))))
      rep.themeSelectFound = !!sel
      if (!sel) return { ok:false, rep, error:'theme select not found' }

      rep.bodyThemeBefore = document.body.getAttribute('data-theme')
      rep.selectValueBefore = sel.value
      const target = sel.value === 'dark' ? 'white' : 'dark'
      rep.target = target
      // trigger React onChange via native value setter
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      setter.call(sel, target)
      sel.dispatchEvent(new Event('change', { bubbles: true }))
      await sleep(400)
      rep.bodyThemeAfterChange = document.body.getAttribute('data-theme')

      // click Save (within the modal content)
      const saveBtn = Array.from(document.querySelectorAll('button')).find(b => /^\\s*(save|保存)\\s*$/i.test((b.textContent||'').trim()))
      rep.saveBtnFound = !!saveBtn
      if (saveBtn) { saveBtn.click(); await sleep(600) }
      rep.bodyThemeAfterSave = document.body.getAttribute('data-theme')

      rep.errors = window.__err
      return { ok:true, rep }
    } catch (err) { return { ok:false, rep, error: String(err && (err.stack||err.message) || err) } }
  })()`
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (_ev, level, message) =>
    consoleLogs.push({ level, message: String(message).slice(0, 300) })
  )
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

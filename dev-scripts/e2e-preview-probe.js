// Real-renderer feature probe (main process) for the preview-only toggle,
// the paste fix, and the Cmd-Alt-F keymap release.
//
// Boots the app against throwaway storage, opens a Markdown note, then asserts:
//   1. paste inserts the OS clipboard text (regression for the TDZ paste bug)
//   2. CodeMirror's Cmd-Alt-F is released (no longer bound to "replace")
//   3. the Preview toolbar button hides the editor (preview-only)
//   4. toggling it back re-shows the editor
// Two screenshots (preview-only / editor) are written for visual inspection.
//
// Run: TB_E2E_PROBE=dev-scripts/e2e-preview-probe.js \
//      TB_E2E_RESULT=/tmp/preview-result.json electron .
const { app, clipboard } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-preview-result.json')
const SHOT_DIR = process.env.TB_E2E_SHOTS || os.tmpdir()
const MARKER = 'PASTE_MARKER_' + process.pid

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-preview-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'previewfolder', name: 'PREVIEW', color: '#E10051' }],
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
  } catch (e) {
    console.error('preview-probe: failed to write result:', e)
  }
  setTimeout(() => app.exit(code), 300)
}

setTimeout(() => finish(3, { error: 'watchdog timeout (90s)' }), 90000)

// Seeds storage on first load, then reloads. Returns true once storage is live.
function seedSource() {
  return `(() => {
    let list = []
    try { list = JSON.parse(localStorage.getItem('storages')) || [] } catch (e) {}
    if (!Array.isArray(list) || list.length === 0) {
      localStorage.setItem('storages', JSON.stringify([{
        key: 'previewstorage', name: 'PREVIEW', type: 'FILESYSTEM',
        path: ${JSON.stringify(storageDir)}
      }]))
      setTimeout(() => location.reload(), 50)
      return false
    }
    return true
  })()`
}

// Step 1: open a note, run the paste + keymap checks, then switch to preview-only.
function setupSource() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const report = { steps: [] }
    try {
      window.__errors = []
      window.addEventListener('error', e =>
        window.__errors.push(String((e.error && (e.error.stack || e.error.message)) || e.message)))

      for (let i = 0; i < 40; i++) {
        if (!document.getElementById('loadingCover') &&
            document.getElementById('content') &&
            document.getElementById('content').children.length > 0) break
        await sleep(250)
      }
      if (document.getElementById('loadingCover')) return { ok: false, report, error: 'stuck on loading cover' }
      report.steps.push('ui-ready')

      document.querySelector('.NewNoteButton button').click(); await sleep(700)
      const modalEl = document.querySelector('.ModalBase')
      const mdBtn = Array.from((modalEl || document).querySelectorAll('button'))
        .find(b => /markdown|マークダウン/i.test(b.textContent))
      if (!mdBtn) return { ok: false, report, error: 'no Markdown button' }
      mdBtn.click()

      let cmEl = null
      for (let i = 0; i < 40; i++) {
        cmEl = document.querySelector('.CodeMirror')
        if (cmEl && cmEl.CodeMirror && cmEl.CodeMirror.getValue() === '') break
        cmEl = null; await sleep(250)
      }
      if (!cmEl) return { ok: false, report, error: 'empty editor did not appear' }
      const cm = cmEl.CodeMirror
      report.steps.push('editor-open')

      // (2) Cmd-Alt-F released -> value is exactly false (not a command/function)
      const extra = cm.getOption('extraKeys') || {}
      report.cmdAltFReleased = extra['Cmd-Alt-F'] === false

      cm.setValue('# Hello\\n\\nWorld body text'); await sleep(300)

      // (1) paste regression: dispatch a paste, expect the OS clipboard marker
      cm.focus(); cm.setCursor({ line: cm.lineCount() - 1, ch: 999 })
      const ta = cmEl.querySelector('textarea')
      ta.focus()
      ta.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }))
      await sleep(300)
      report.pasteInserted = cm.getValue().includes('${MARKER}')

      const editorHidden = () => {
        const el = document.querySelector('.CodeEditor')
        return !!el && /hide/.test(el.className)
      }
      report.editorHiddenInitially = editorHidden()

      const previewBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.querySelector('.fa-eye, .fa-eye-slash'))
      report.previewButtonFound = !!previewBtn
      if (!previewBtn) return { ok: false, report, error: 'Preview toolbar button not found' }

      // (3) switch to preview-only
      previewBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await sleep(500)
      report.editorHiddenAfterPreview = editorHidden()
      report.errors = window.__errors
      return { ok: true, report }
    } catch (err) {
      return { ok: false, report, error: 'setup exception: ' + (err && (err.stack || err.message) || String(err)) }
    }
  })()`
}

// Step 2: switch back to the Editor segment of the 3-way switcher, expect the
// editor visible again.
function toggleBackSource() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    try {
      const editorHidden = () => {
        const el = document.querySelector('.CodeEditor')
        return !!el && /hide/.test(el.className)
      }
      const editorBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.querySelector('.fa-pencil'))
      editorBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await sleep(500)
      return { editorVisibleAfterToggleBack: !editorHidden() }
    } catch (err) {
      return { error: String(err && (err.stack || err.message) || err) }
    }
  })()`
}

async function shot(wc, name) {
  try {
    const img = await wc.capturePage()
    fs.writeFileSync(
      path.join(SHOT_DIR, 'preview-' + name + '.png'),
      img.toPNG()
    )
  } catch (e) {}
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (_ev, level, message) => {
    consoleLogs.push({ level, message: String(message).slice(0, 400) })
  })
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seedSource(), true)
        if (!seeded) return // reload will fire did-finish-load again
        if (ran) return
        ran = true

        clipboard.writeText(MARKER)
        const setup = await wc.executeJavaScript(setupSource(), true)
        await shot(wc, 'preview-only')
        if (!setup || !setup.ok) {
          return finish(1, setup || { error: 'setup returned nothing' })
        }
        const back = await wc.executeJavaScript(toggleBackSource(), true)
        await shot(wc, 'editor')

        const report = Object.assign({}, setup.report, back)
        const pass =
          report.pasteInserted === true &&
          report.cmdAltFReleased === true &&
          report.editorHiddenInitially === false &&
          report.editorHiddenAfterPreview === true &&
          report.editorVisibleAfterToggleBack === true
        finish(pass ? 0 : 1, { phase: pass ? 'pass' : 'fail', report })
      } catch (err) {
        finish(2, { error: 'executeJavaScript failed: ' + err.message })
      }
    }, 4000)
  })
})

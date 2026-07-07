// E2E smoke probe (main process).
//
// Loaded from index.js when TB_E2E_PROBE is set. Boots the real app against a
// throwaway userData + storage dir, then drives the renderer through the core
// note flow: create note → type markdown → wait for the debounced save →
// assert the note list shows the derived title. All renderer console output is
// captured so silent failures (e.g. "Cannot save note") surface in the result.
//
// Result JSON is written to TB_E2E_RESULT (default: <tmp>/tb-e2e-result.json).
// Exit codes: 0 pass, 1 flow failed, 2 probe error, 3 watchdog timeout.
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-e2e-result.json')
const MARKER = 'E2E_PROBE_TITLE_' + process.pid

// Isolated environment: never touch the developer's real notes/config.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-e2e-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'e2efolder01a', name: 'E2E', color: '#E10051' }],
    version: '1.0'
  })
)
app.setPath('userData', path.join(tmpRoot, 'userData'))
// Redirect home too: on first boot with empty localStorage the legacy-import
// path in dataApi/init would otherwise pick up the developer's real
// ~/Boostnote directory (and the probe would write test notes into it).
app.setPath('home', tmpRoot)

const consoleLogs = []
let finished = false

function finish(code, result) {
  if (finished) return
  finished = true
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, result, consoleLogs }, null, 2)
    )
  } catch (e) {
    console.error('e2e-probe: failed to write result:', e)
  }
  setTimeout(() => app.exit(code), 300)
}

setTimeout(() => finish(3, { error: 'watchdog timeout (90s)' }), 90000)

// The renderer driver. Runs twice: first load seeds localStorage with the
// throwaway storage and reloads; second load exercises the note flow.
function driverSource() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const report = { steps: [] }
    try {
      const raw = localStorage.getItem('storages')
      let list = []
      try { list = JSON.parse(raw) || [] } catch (e) {}
      if (!Array.isArray(list) || list.length === 0) {
        localStorage.setItem('storages', JSON.stringify([{
          key: 'e2estorage1',
          name: 'E2E',
          type: 'FILESYSTEM',
          path: ${JSON.stringify(storageDir)}
        }]))
        setTimeout(() => location.reload(), 50)
        return { phase: 'seeded' }
      }
      report.steps.push('storage-present')

      for (let i = 0; i < 40; i++) {
        if (!document.getElementById('loadingCover') &&
            document.getElementById('content') &&
            document.getElementById('content').children.length > 0) break
        await sleep(250)
      }
      if (document.getElementById('loadingCover')) {
        return { phase: 'fail', report, error: 'stuck on loading cover' }
      }
      report.steps.push('ui-ready')

      const countTitles = () => document.querySelectorAll(
        '[class*="item-title"], [class*="item-simple-title"]'
      ).length
      report.noteTitlesBefore = countTitles()

      const newBtn = document.querySelector('.NewNoteButton button')
      if (!newBtn) return { phase: 'fail', report, error: 'NewNoteButton not found' }
      newBtn.click()
      await sleep(700)

      // defaultNote is ALWAYS_ASK out of the box: a modal appears. Prefer a
      // text match ("Markdown") so we never click an unrelated control.
      report.modalAttr = document.body.getAttribute('data-modal')
      const modalEl = document.querySelector('.ModalBase')
      report.modalState = modalEl
        ? { hidden: modalEl.className.includes('hide'), htmlLen: modalEl.innerHTML.length }
        : null
      const modalScope = modalEl || document
      report.modalText = modalEl ? modalEl.innerText.replace(/\\s+/g, ' ').slice(0, 200) : null
      // Label is locale-dependent: "Markdown Note" (en) / "マークダウン" (ja).
      const mdBtn = Array.from(modalScope.querySelectorAll('button'))
        .find(b => /markdown|マークダウン/i.test(b.textContent))
      if (!mdBtn) {
        return { phase: 'fail', report, error: 'new-note modal did not open (no Markdown button found)' }
      }
      mdBtn.click()
      report.steps.push('modal-markdown-clicked')

      // A NEW note must open with an EMPTY editor (a non-empty editor means we
      // are still looking at a pre-existing note and creation silently failed).
      let cmEl = null
      for (let i = 0; i < 40; i++) {
        cmEl = document.querySelector('.CodeMirror')
        if (cmEl && cmEl.CodeMirror && cmEl.CodeMirror.getValue() === '') break
        cmEl = null
        await sleep(250)
      }
      if (!cmEl || !cmEl.CodeMirror) {
        return { phase: 'fail', report, error: 'empty editor for the new note did not appear' }
      }
      report.steps.push('new-note-editor-open')
      report.noteTitlesAfterCreate = countTitles()

      cmEl.CodeMirror.setValue('# ${MARKER}\\n\\ne2e body text')
      report.steps.push('content-set')

      // save debounce is 1000ms; give it margin, then check the note list.
      await sleep(3000)
      const titleEls = Array.from(document.querySelectorAll(
        '[class*="item-title"], [class*="item-simple-title"]'
      ))
      report.titleCandidates = titleEls
        .map(el => (el.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 20)
      const listHasTitle = titleEls.some(el =>
        (el.textContent || '').includes('${MARKER}')
      )
      report.listHasTitle = listHasTitle
      if (!listHasTitle) {
        return { phase: 'fail', report, error: 'note list title was not updated after save' }
      }
      return { phase: 'pass', report }
    } catch (err) {
      return {
        phase: 'fail',
        report,
        error: 'driver exception: ' + (err && (err.stack || err.message) || String(err))
      }
    }
  })()`
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (_ev, level, message) => {
    consoleLogs.push({ level, message: String(message).slice(0, 600) })
  })
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const result = await wc.executeJavaScript(driverSource(), true)
        if (result && result.phase === 'seeded') return
        finish(result && result.phase === 'pass' ? 0 : 1, result)
      } catch (err) {
        finish(2, { error: 'executeJavaScript failed: ' + err.message })
      }
    }, 4000)
  })
})

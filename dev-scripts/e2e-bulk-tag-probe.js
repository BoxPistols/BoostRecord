// Real-renderer probe for the bulk-selection action bar + bulk tagging.
//
// Boots the app against throwaway storage, creates two Markdown notes,
// multi-selects them (Cmd/Ctrl-click), then asserts:
//   1. the bulk bar renders as a single non-overflowing row (layout "崩れ" fix):
//      the count does not overlap the actions and the actions stay inside the
//      panel width.
//   2. the "Edit Tags" button opens the bulk tag editor.
//   3. typing a tag + Enter adds it to BOTH selected notes — verified against
//      the persisted .cson files on disk (ground truth), not just the DOM.
//   4. removing the tag chip removes it from BOTH notes on disk.
//
// Run: TB_E2E_PROBE=dev-scripts/e2e-bulk-tag-probe.js \
//      TB_E2E_RESULT=/tmp/bulk-tag-result.json electron .
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-bulk-tag-result.json')
const SHOT_DIR = process.env.TB_E2E_SHOTS || os.tmpdir()
const TAG = 'e2e_bulk_' + process.pid

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-bulktag-'))
const storageDir = path.join(tmpRoot, 'storage')
const notesDir = path.join(storageDir, 'notes')
fs.mkdirSync(notesDir, { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'bulkfolder', name: 'BULK', color: '#E10051' }],
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
    console.error('bulk-tag-probe: failed to write result:', e)
  }
  setTimeout(() => app.exit(code), 300)
}

setTimeout(() => finish(3, { error: 'watchdog timeout (90s)' }), 90000)

// Walk tmpRoot for every persisted .cson note (notes may live in the seeded
// storage or in the app's default ~/Boostnote storage) and count how many
// contain the tag. TAG is unique per pid so a bare substring match is safe
// regardless of CSON quoting style.
function allCsonFiles(dir, acc) {
  acc = acc || []
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return acc
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) allCsonFiles(full, acc)
    else if (e.name.endsWith('.cson')) acc.push(full)
  }
  return acc
}

function notesWithTagOnDisk() {
  const files = allCsonFiles(tmpRoot)
  let count = 0
  for (const f of files) {
    try {
      if (fs.readFileSync(f, 'utf8').includes(TAG)) count++
    } catch (e) {}
  }
  return { count, total: files.length }
}

function seedSource() {
  return `(() => {
    let list = []
    try { list = JSON.parse(localStorage.getItem('storages')) || [] } catch (e) {}
    if (!Array.isArray(list) || list.length === 0) {
      localStorage.setItem('storages', JSON.stringify([{
        key: 'bulkstorage', name: 'BULK', type: 'FILESYSTEM',
        path: ${JSON.stringify(storageDir)}
      }]))
      setTimeout(() => location.reload(), 50)
      return false
    }
    return true
  })()`
}

// Create two Markdown notes so the list has something to multi-select.
function createNotesSource() {
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

      async function makeNote(body) {
        document.querySelector('.NewNoteButton button').click(); await sleep(600)
        const modalEl = document.querySelector('.ModalBase')
        const mdBtn = Array.from((modalEl || document).querySelectorAll('button'))
          .find(b => /markdown|マークダウン/i.test(b.textContent))
        if (!mdBtn) throw new Error('no Markdown button')
        mdBtn.click()
        let cmEl = null
        for (let i = 0; i < 40; i++) {
          cmEl = document.querySelector('.CodeMirror')
          if (cmEl && cmEl.CodeMirror && cmEl.CodeMirror.getValue() === '') break
          cmEl = null; await sleep(200)
        }
        if (!cmEl) throw new Error('empty editor did not appear')
        cmEl.CodeMirror.setValue(body); await sleep(500)
      }

      await makeNote('# First bulk note\\n\\nalpha')
      await makeNote('# Second bulk note\\n\\nbeta')
      report.steps.push('two-notes-created')

      // wait until the list shows 2 items
      let items = []
      for (let i = 0; i < 40; i++) {
        items = Array.from(document.querySelectorAll('[data-note-list] [draggable="true"]'))
        if (items.length >= 2) break
        await sleep(200)
      }
      report.noteItemCount = items.length
      if (items.length < 2) return { ok: false, report, error: 'expected 2 notes in list, got ' + items.length }
      return { ok: true, report }
    } catch (err) {
      return { ok: false, report, error: 'create exception: ' + (err && (err.stack || err.message) || String(err)) }
    }
  })()`
}

// Multi-select the two notes and open the tag editor.
function selectAndOpenSource() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const report = {}
    try {
      const items = Array.from(document.querySelectorAll('[data-note-list] [draggable="true"]'))
      if (items.length < 2) return { ok: false, error: 'lost note items', report }

      // plain click first note, Cmd/Ctrl-click the second -> 2 selected
      items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await sleep(200)
      items[1].dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true, ctrlKey: true }))
      await sleep(400)

      const bar = document.querySelector('.NoteList [class*="bulk-bar"]')
      report.bulkBarShown = !!bar
      if (!bar) return { ok: false, error: 'bulk bar did not appear', report }

      const root = document.querySelector('.NoteList')
      const count = bar.querySelector('[class*="bulk-count"]')
      const actions = bar.querySelector('[class*="bulk-actions"]')
      const rootRect = root.getBoundingClientRect()
      const countRect = count.getBoundingClientRect()
      const actionsRect = actions.getBoundingClientRect()
      // Layout assertions: single row, no overlap, actions inside the panel.
      report.barHeight = Math.round(bar.getBoundingClientRect().height)
      report.countRight = Math.round(countRect.right)
      report.actionsLeft = Math.round(actionsRect.left)
      report.actionsRight = Math.round(actionsRect.right)
      report.rootRight = Math.round(rootRect.right)
      report.noOverlap = countRect.right <= actionsRect.left + 1
      report.actionsInside = actionsRect.right <= rootRect.right + 1
      report.actionButtons = actions.querySelectorAll('button').length

      // open the tag editor via the tag button
      const tagBtn = Array.from(bar.querySelectorAll('button'))
        .find(b => b.querySelector('.fa-tag'))
      report.tagButtonFound = !!tagBtn
      if (!tagBtn) return { ok: false, error: 'tag button not found', report }
      tagBtn.click()
      await sleep(300)
      const editor = document.querySelector('.NoteList [class*="bulk-tag-editor"]')
      report.editorOpened = !!editor
      report.errors = window.__errors
      return { ok: true, report }
    } catch (err) {
      return { ok: false, error: String(err && (err.stack || err.message) || err), report }
    }
  })()`
}

// Type a tag + Enter to apply it to both selected notes.
function addTagSource() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    try {
      const input = document.querySelector('.NoteList [class*="bulk-tag-input"]')
      if (!input) return { ok: false, error: 'tag input not found' }
      // Stacking proof: the editor must paint ABOVE the note list, not just
      // exist in the DOM. Hit-test the input's centre point.
      const r = input.getBoundingClientRect()
      const topEl = document.elementFromPoint(
        Math.round(r.left + r.width / 2),
        Math.round(r.top + r.height / 2)
      )
      const editorRoot = document.querySelector('.NoteList [class*="bulk-tag-editor"]')
      const inputOnTop =
        !!topEl && !!editorRoot && (editorRoot.contains(topEl) || topEl === input)
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, ${JSON.stringify(TAG)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await sleep(150)
      const ev = new KeyboardEvent('keydown', { bubbles: true })
      Object.defineProperty(ev, 'keyCode', { get: () => 13 })
      input.dispatchEvent(ev)
      await sleep(700)
      const chip = Array.from(document.querySelectorAll('.NoteList [class*="bulk-tag-label"]'))
        .find(el => el.textContent.indexOf(${JSON.stringify(TAG)}) !== -1)
      return { ok: true, chipShown: !!chip, inputOnTop }
    } catch (err) {
      return { ok: false, error: String(err && (err.stack || err.message) || err) }
    }
  })()`
}

// Click the chip's remove button to remove the tag from both notes.
function removeTagSource() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    try {
      const removeBtn = document.querySelector('.NoteList [class*="bulk-tag-remove"]')
      if (!removeBtn) return { ok: false, error: 'remove button not found' }
      removeBtn.click()
      await sleep(700)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err && (err.stack || err.message) || err) }
    }
  })()`
}

async function shot(wc, name) {
  try {
    const img = await wc.capturePage()
    fs.writeFileSync(path.join(SHOT_DIR, 'bulk-' + name + '.png'), img.toPNG())
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
        if (!seeded) return
        if (ran) return
        ran = true

        const created = await wc.executeJavaScript(createNotesSource(), true)
        if (!created || !created.ok)
          return finish(1, created || { error: 'create returned nothing' })

        const select = await wc.executeJavaScript(selectAndOpenSource(), true)
        await shot(wc, 'bar')
        if (!select || !select.ok)
          return finish(1, select || { error: 'select returned nothing' })

        const add = await wc.executeJavaScript(addTagSource(), true)
        await shot(wc, 'tagged')
        const afterAdd = notesWithTagOnDisk()

        const remove = await wc.executeJavaScript(removeTagSource(), true)
        const afterRemove = notesWithTagOnDisk()

        const report = Object.assign({}, select.report, {
          add,
          remove,
          afterAdd,
          afterRemove
        })
        const pass =
          report.bulkBarShown === true &&
          report.noOverlap === true &&
          report.actionsInside === true &&
          report.editorOpened === true &&
          add &&
          add.ok === true &&
          add.chipShown === true &&
          add.inputOnTop === true &&
          afterAdd.total >= 2 &&
          // exactly the two selected notes were tagged (not the whole storage)
          afterAdd.count === 2 &&
          remove &&
          remove.ok === true &&
          afterRemove.count === 0
        finish(pass ? 0 : 1, { phase: pass ? 'pass' : 'fail', report })
      } catch (err) {
        finish(2, { error: 'executeJavaScript failed: ' + err.message })
      }
    }, 4000)
  })
})

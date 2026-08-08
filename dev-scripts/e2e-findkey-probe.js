// 「ノート内で Cmd+F を押すと何が起きるか」を実機で測るだけの probe。
//
// 主張の裏取りが目的。CodeMirror の search addon は lib/main.production.html の
// <script> で読み込まれており、既定 keyMap 'sublime' は macDefault へ
// fallthrough するので 'Cmd-F': 'find' に届く「はず」——だが、それは
// コードを読んだ推測でしかない。実際に撃って観測する。
//
// 測ること:
//   1. エディタにフォーカスがある時の Cmd+F
//   2. プレビュー(iframe)にフォーカスがある時の Cmd+F
//   3. どちらでもない(body)時の Cmd+F
// 各ケースで .CodeMirror-dialog の有無 / activeElement / キーが renderer に
// 届いたか を記録する。
//
// Exit: 0 観測できた / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-findkey-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-findkey-'))
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
  console.log('\n=== find key probe ===')
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
setTimeout(() => finish(3, { error: 'watchdog' }), 120000)

function seed() {
  return `(() => {
    if (localStorage.getItem('__findKeySeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__findKeySeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

const SPY = `(() => {
  const { ipcRenderer } = require('electron')
  window.__findKey = { keys: [], ipc: 0 }
  // removeAllListeners は**アプリ側のリスナーごと消す**。観測のつもりで
  // 対象を壊してしまうので、足すだけにする
  ipcRenderer.on('detail:find', () => { window.__findKey.ipc += 1 })
  window.addEventListener('keydown', e => {
    if ((e.key || '').toLowerCase() === 'f' && (e.metaKey || e.ctrlKey)) {
      window.__findKey.keys.push({ where: 'parent-capture', key: e.key })
    }
  }, true)
  void ipcRenderer
  return true
})()`

const STATE = `(() => {
  const el = document.activeElement
  const dialog = document.querySelector('.CodeMirror-dialog')
  const searchField = document.querySelector('.CodeMirror-search-field')
  const store = window.__findKey || { keys: [], ipc: 0 }
  const seen = store.keys || []
  const ipc = store.ipc || 0
  store.keys = []
  store.ipc = 0
  return {
    dialogCount: document.querySelectorAll('.CodeMirror-dialog').length,
    hasSearchField: !!searchField,
    dialogText: dialog ? (dialog.textContent || '').trim().slice(0, 60) : null,
    activeTag: el ? el.tagName : null,
    activeClass: el ? String(el.className || '').slice(0, 60) : null,
    keySeenInRenderer: seen.length,
    ipcReceived: ipc
  }
})()`

function press(wc, keyCode, modifiers) {
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  return new Promise(resolve => setTimeout(resolve, 700))
}

async function clickAt(wc, x, y) {
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
  await new Promise(resolve => setTimeout(resolve, 400))
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true

        const win = BrowserWindow.getAllWindows()[0]
        win.focus()
        wc.focus()

        await wc.executeJavaScript(
          `(async () => { const s = ms => new Promise(r => setTimeout(r, ms))
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await s(250) }
             return true })()`,
          true
        )

        // ノートを作って本文を入れる（検索対象が要る）
        const made = await wc.executeJavaScript(
          `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
             const b = document.querySelector('.NewNoteButton button')
             if (!b) return { ok:false, step:'no NewNoteButton' }
             b.click(); await sleep(700)
             const modal = document.querySelector('.ModalBase') || document
             const md = Array.from(modal.querySelectorAll('button'))
               .find(x => /markdown|マークダウン/i.test(x.textContent))
             if (!md) return { ok:false, step:'no markdown button' }
             md.click()
             let cm = null
             for (let i=0;i<40;i++){
               cm = document.querySelector('.CodeMirror')
               if (cm && cm.CodeMirror && cm.CodeMirror.getValue() === '') break
               cm = null; await sleep(250)
             }
             if (!cm) return { ok:false, step:'no empty editor' }
             cm.CodeMirror.setValue('# needle\\n\\nalpha needle beta\\n\\nneedle again\\n')
             await sleep(1200)
             return { ok:true }
           })()`,
          true
        )
        rows.push({ label: 'note created', data: made })
        if (!made.ok) return finish(2, { error: 'setup: ' + made.step })

        await wc.executeJavaScript(SPY, true)
        const isMac = process.platform === 'darwin'
        const SUPER = isMac ? 'cmd' : 'control'

        // --- 1. エディタにフォーカス ---
        const editorPos = await wc.executeJavaScript(
          `(() => { const cm = document.querySelector('.CodeMirror')
             if (!cm) return null
             const r = cm.getBoundingClientRect()
             return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + 60) } })()`,
          true
        )
        if (editorPos) await clickAt(wc, editorPos.x, editorPos.y)
        await wc.executeJavaScript(STATE, true) // reset counter
        await press(wc, 'F', [SUPER])
        const inEditor = await wc.executeJavaScript(STATE, true)
        rows.push({ label: 'Cmd+F: エディタにフォーカス', data: inEditor })

        // ダイアログが出たら Esc で閉じる
        await press(wc, 'Escape', [])

        // --- 2. プレビュー(iframe)にフォーカス ---
        const previewPos = await wc.executeJavaScript(
          `(() => { const f = document.querySelector('iframe.MarkdownPreview, .MarkdownPreview')
             if (!f) return null
             const r = f.getBoundingClientRect()
             return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + 60) } })()`,
          true
        )
        rows.push({ label: 'preview rect', data: previewPos })
        if (previewPos) await clickAt(wc, previewPos.x, previewPos.y)
        await wc.executeJavaScript(STATE, true)
        await press(wc, 'F', [SUPER])
        const inPreview = await wc.executeJavaScript(STATE, true)
        rows.push({ label: 'Cmd+F: プレビューにフォーカス', data: inPreview })
        await press(wc, 'Escape', [])

        // --- 3. body（どちらでもない） ---
        await wc.executeJavaScript('document.body.focus(); true', true)
        await wc.executeJavaScript(STATE, true)
        await press(wc, 'F', [SUPER])
        const inBody = await wc.executeJavaScript(STATE, true)
        rows.push({ label: 'Cmd+F: body にフォーカス', data: inBody })

        // --- FindBar の実挙動 ---
        const bar = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             const el = document.querySelector('.FindBar input')
             if (!el) return { ok:false, step:'no FindBar' }
             const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
             setter.call(el, 'needle')
             el.dispatchEvent(new Event('input', { bubbles: true }))
             await sleep(500)
             const countEl = document.querySelector('[class*="FindBar"] [class*="count"], .FindBar span')
             const counts = Array.from(document.querySelectorAll('.FindBar span'))
               .map(s => (s.textContent||'').trim()).filter(Boolean)
             return { ok:true, counts, focused: document.activeElement === el }
           })()`,
          true
        )
        rows.push({ label: 'FindBar 入力', data: bar })

        // Enter で次へ（3回押して巡回するか）
        const stepped = []
        for (let i = 0; i < 3; i++) {
          await press(wc, 'Return', [])
          const c = await wc.executeJavaScript(
            `(() => Array.from(document.querySelectorAll('.FindBar span'))
               .map(s => (s.textContent||'').trim()).filter(Boolean))()`,
            true
          )
          stepped.push(c)
        }
        rows.push({ label: 'Enter で次へ x3', data: stepped })

        // プレビューのハイライトが実際に塗られているか（Range が生きているか）
        const hl = await wc.executeJavaScript(
          `(() => {
             const f = document.querySelector('iframe.MarkdownPreview, .MarkdownPreview')
             const doc = f && f.contentWindow && f.contentWindow.document
             if (!doc) return { error: 'no preview doc' }
             const win = doc.defaultView
             const has = !!(win.CSS && win.CSS.highlights)
             const all = has && win.CSS.highlights.get('tb-find-all')
             let live = 0
             if (all) for (const r of all) { if (r.getClientRects().length) live++ }
             return { supported: has, registered: !!all, liveRanges: live }
           })()`,
          true
        )
        rows.push({ label: 'プレビューのハイライト', data: hl })

        // --- PREVIEW モードで測る（本題）---
        await press(wc, 'Escape', [])
        const toPreview = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             const b = Array.from(document.querySelectorAll('button[aria-pressed]'))
               .find(x => { const i = x.querySelector('i.fa'); return i && /fa-eye/.test(i.className) })
             if (!b) return { ok:false }
             b.click(); await sleep(800); return { ok:true }
           })()`,
          true
        )
        rows.push({ label: 'PREVIEW へ切替', data: toPreview })

        await press(wc, 'F', [SUPER])
        const pv = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             const el = document.querySelector('.FindBar input')
             if (!el) return { ok:false, step:'no FindBar' }
             const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
             setter.call(el, 'needle')
             el.dispatchEvent(new Event('input', { bubbles: true }))
             await sleep(600)
             return {
               ok:true,
               counts: Array.from(document.querySelectorAll('.FindBar span'))
                 .map(s => (s.textContent||'').trim()).filter(Boolean)
             }
           })()`,
          true
        )
        rows.push({ label: 'PREVIEW で検索', data: pv })

        await press(wc, 'Return', [])
        const pvHl = await wc.executeJavaScript(
          `(() => {
             const f = document.querySelector('iframe.MarkdownPreview, .MarkdownPreview')
             const doc = f && f.contentWindow && f.contentWindow.document
             if (!doc) return { error: 'no preview doc' }
             const win = doc.defaultView
             const all = win.CSS.highlights.get('tb-find-all')
             const active = win.CSS.highlights.get('tb-find-active')
             let live = 0
             if (all) for (const r of all) { if (r.getClientRects().length) live++ }
             let activeLive = 0
             if (active) for (const r of active) { if (r.getClientRects().length) activeLive++ }
             return { allRegistered: !!all, liveRanges: live, activeLive }
           })()`,
          true
        )
        rows.push({ label: 'PREVIEW のハイライト実描画', data: pvHl })

        const img = await win.webContents.capturePage()
        const shot = path.join(
          process.env.TB_SHOT_DIR || os.tmpdir(),
          'find-preview.png'
        )
        fs.writeFileSync(shot, img.toPNG())
        rows.push({ label: 'SHOT', data: shot })

        const verdict = [
          `エディタ: ${
            inEditor.hasSearchField
              ? '検索ダイアログが出る'
              : 'ダイアログは出ない'
          }`,
          `プレビュー: ${
            inPreview.hasSearchField
              ? '検索ダイアログが出る'
              : 'ダイアログは出ない'
          }`,
          `body: ${
            inBody.hasSearchField
              ? '検索ダイアログが出る'
              : 'ダイアログは出ない'
          }`
        ].join(' / ')

        finish(0, { verdict })
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

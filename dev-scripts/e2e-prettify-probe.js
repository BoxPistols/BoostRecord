// 整形（既定 Cmd/Ctrl+Shift+F）が本文を壊さないかを実機で測る probe。
//
// 以前は構文に関係なく必ず prettier の markdown パーサを通していた。
// シェルのスニペットにかけると `#` 行が見出しとして扱われ、ブロックの間に
// 空行が入って**コードが壊れる**（利用者からの報告）。
//
// 測ること:
//   1. シェルのスニペット: 本文が1文字も変わらないこと + 理由が出ること
//   2. Markdown ノート: 従来どおり整形されること（退行していないこと）
//
// ダイアログは実物を出すと probe が止まるので、呼び出しを差し替えて
// 「何が出たか」を記録する（出たこと自体も検証対象）。
//
// Exit: 0 全部 PASS / 1 FAIL あり / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-prettify-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-prettify-'))
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

// 利用者の報告そのままの形。行頭 `#` が続くコメントブロック
const SHELL_SOURCE =
  '# ------------------------------------------------------------\n' +
  '# 9. エイリアス\n' +
  '# ------------------------------------------------------------\n' +
  "alias lg='git log'\n"

const rows = []
let finished = false
let ran = false

function check(label, ok, data) {
  rows.push({ label, verdict: ok ? 'PASS' : 'FAIL', data })
  return ok
}

function finish(code, result) {
  if (finished) return
  finished = true
  console.log('\n=== prettify probe ===')
  rows.forEach(r =>
    console.log(
      `${r.verdict || 'ROW '}  ${r.label} — ${JSON.stringify(r.data)}`
    )
  )
  const failed = rows.filter(r => r.verdict === 'FAIL').length
  const passed = rows.filter(r => r.verdict === 'PASS').length
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
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
    if (localStorage.getItem('__prettifySeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__prettifySeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

// ダイアログを差し替える。**実物を出すと probe が止まる**うえに、
// 「理由が出たか」を観測する手段がなくなる
const STUB_DIALOG = `(() => {
  const remote = require('@electron/remote')
  window.__dialogs = []
  if (!remote.dialog.__stubbed) {
    remote.dialog.showMessageBox = (win, opts) => {
      window.__dialogs.push(opts && opts.message ? opts : win)
      return Promise.resolve({ response: 0 })
    }
    remote.dialog.__stubbed = true
  }
  return true
})()`

function press(wc, keyCode, modifiers) {
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  return new Promise(resolve => setTimeout(resolve, 900))
}

async function clickAt(wc, x, y) {
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
  await new Promise(resolve => setTimeout(resolve, 400))
}

async function focusEditor(wc) {
  const pos = await wc.executeJavaScript(
    `(() => { const cm = document.querySelector('.CodeMirror')
       if (!cm) return null
       const r = cm.getBoundingClientRect()
       return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + 30) } })()`,
    true
  )
  if (pos) await clickAt(wc, pos.x, pos.y)
  return !!pos
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
        await wc.executeJavaScript(STUB_DIALOG, true)

        const SUPER = process.platform === 'darwin' ? 'cmd' : 'control'

        // ---- 1. シェルのスニペット ----
        const madeSnippet = await wc.executeJavaScript(
          `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
             const b = document.querySelector('.NewNoteButton button')
             if (!b) return { ok:false, step:'no NewNoteButton' }
             b.click(); await sleep(700)
             const modal = document.querySelector('.ModalBase') || document
             const snip = Array.from(modal.querySelectorAll('button'))
               .find(x => /snippet|スニペット/i.test(x.textContent))
             if (!snip) return { ok:false, step:'no snippet button' }
             snip.click()
             let cm = null
             for (let i=0;i<40;i++){
               cm = document.querySelector('.CodeMirror')
               if (cm && cm.CodeMirror && cm.CodeMirror.getValue() === '') break
               cm = null; await sleep(250)
             }
             if (!cm) return { ok:false, step:'no empty editor' }
             cm.CodeMirror.setValue(${JSON.stringify(SHELL_SOURCE)})
             const CM = window.CodeMirror
             const syntax = CM.findModeByName('Shell')
             cm.CodeMirror.setOption('mode', syntax.mime)
             CM.autoLoadMode(cm.CodeMirror, syntax.mode)
             await sleep(1200)
             window.__dialogs = []
             return { ok:true, mode: cm.CodeMirror.getOption('mode') }
           })()`,
          true
        )
        rows.push({ label: 'シェルのスニペットを用意', data: madeSnippet })
        if (!madeSnippet.ok) return finish(2, { error: madeSnippet.step })
        check(
          'モードが shell になっている（測れている証拠）',
          madeSnippet.mode === 'text/x-sh',
          madeSnippet.mode
        )

        await focusEditor(wc)
        await press(wc, 'F', [SUPER, 'shift'])

        const afterShell = await wc.executeJavaScript(
          `(() => {
             const cm = document.querySelector('.CodeMirror')
             return {
               value: cm.CodeMirror.getValue(),
               dialogs: (window.__dialogs || []).map(d => d && d.message)
             }
           })()`,
          true
        )
        check(
          '**シェルの本文が1文字も変わらない**',
          afterShell.value === SHELL_SOURCE,
          {
            changed: afterShell.value !== SHELL_SOURCE,
            got: afterShell.value.slice(0, 120)
          }
        )
        check(
          '空行が挿入されていない',
          !/\n\s*\n/.test(afterShell.value),
          afterShell.value.slice(0, 120)
        )
        check(
          '対応していない理由が出る（無反応にしない）',
          afterShell.dialogs.length === 1,
          afterShell.dialogs
        )

        // ---- 2. Markdown ノート（退行していないこと）----
        const madeMd = await wc.executeJavaScript(
          `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
             const b = document.querySelector('.NewNoteButton button')
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
             cm.CodeMirror.setValue('# one\\n# two\\n')
             await sleep(1000)
             window.__dialogs = []
             return { ok:true, mode: cm.CodeMirror.getOption('mode') }
           })()`,
          true
        )
        rows.push({ label: 'Markdown ノートを用意', data: madeMd })
        if (!madeMd.ok) return finish(2, { error: madeMd.step })
        check(
          'Markdown ノートのモードは bfm',
          madeMd.mode === 'text/x-bfm',
          madeMd.mode
        )

        await focusEditor(wc)
        await press(wc, 'F', [SUPER, 'shift'])

        const afterMd = await wc.executeJavaScript(
          `(() => {
             const cm = document.querySelector('.CodeMirror')
             return {
               value: cm.CodeMirror.getValue(),
               dialogs: (window.__dialogs || []).map(d => d && d.message)
             }
           })()`,
          true
        )
        check(
          'Markdown は従来どおり整形される',
          afterMd.value === '# one\n\n# two\n',
          afterMd.value
        )
        check(
          'Markdown では理由ダイアログを出さない',
          afterMd.dialogs.length === 0,
          afterMd.dialogs
        )

        const failed = rows.filter(r => r.verdict === 'FAIL').length
        finish(failed > 0 ? 1 : 0, {})
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

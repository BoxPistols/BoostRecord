// Touch Bar のボタンが renderer を実際に動かすかを測る probe。
//
// Touch Bar ハードウェアは probe では押せないが、ボタンの click ハンドラは
// ただの関数なので直接呼び、renderer 側の結果（route 遷移 / FindBar /
// 新規ノートモーダル）を実測する。バーの視覚表示だけはユーザーの実機目視
// （このマシンでは BTT が Touch Bar を占有している点に注意）。
//
// 測ること:
//   1. build() が items 7 個のバーを作る（Electron 28 実 API で崩れない）
//   2. ⭐️ → /starred、🗑 → /trashed、📒 → /home に遷移する
//   3. 🔍 → FindBar が開く
//   4. ✎ → ノート種別モーダルが開く
//   5. setTouchBar(bar/null) の focus/blur サイクルが例外を出さない
//
// Exit: 0 PASS / 1 FAIL / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-touchbar-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-touchbar-'))
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
  console.log('\n=== touch bar probe ===')
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
    if (localStorage.getItem('__touchBarSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__touchBarSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true

        await wc.executeJavaScript(
          `(async () => { const s = ms => new Promise(r => setTimeout(r, ms))
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await s(250) }
             return true })()`,
          true
        )

        // ノートを1件作っておく（FindBar は Detail が無いと出ない）
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
             cm.CodeMirror.setValue('# touchbar probe note\\n\\nbody\\n')
             await sleep(1000)
             return { ok:true }
           })()`,
          true
        )
        rows.push({ label: 'note created', data: made })
        if (!made.ok) return finish(2, { error: 'setup: ' + made.step })

        // --- 1. 実 Electron API でバーを組む ---
        const { build } = require(path.join(
          app.getAppPath(),
          'lib',
          'touchbar-menu'
        ))
        const { touchBar, buttons, actions } = build()
        rows.push({
          label: 'build()',
          data: { hasBar: !!touchBar, buttonCount: Object.keys(buttons).length }
        })

        const hash = () =>
          wc.executeJavaScript('location.hash.split("?")[0]', true)

        // --- 2. ナビゲーション3ボタン ---
        actions.starredNotes()
        await sleep(600)
        const afterStarred = await hash()
        actions.trash()
        await sleep(600)
        const afterTrash = await hash()
        actions.allNotes()
        await sleep(600)
        const afterHome = await hash()
        rows.push({
          label: 'navigate',
          data: { afterStarred, afterTrash, afterHome }
        })

        // --- 3. 🔍 → FindBar（ノートを開いた状態で）---
        await wc.executeJavaScript(
          `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
             const item = document.querySelector('[class*="NoteItem"]')
             if (item) { item.click(); await sleep(600) }
             return true })()`,
          true
        )
        actions.find()
        await sleep(700)
        const findBar = await wc.executeJavaScript(
          '!!document.querySelector(".FindBar")',
          true
        )
        rows.push({ label: 'find → FindBar', data: { findBar } })
        // 後始末（Esc 相当は FindBar の × でなく keydown だと環境依存なので
        // そのままにする。以降の判定に影響しない）

        // --- 4. ✎ → ノート種別モーダル ---
        actions.newNote()
        await sleep(900)
        const modal = await wc.executeJavaScript(
          '!!document.querySelector(".ModalBase")',
          true
        )
        rows.push({ label: 'newNote → modal', data: { modal } })

        // --- 5. focus/blur の setTouchBar サイクル ---
        const win = BrowserWindow.getAllWindows()[0]
        let cycleError = null
        try {
          win.setTouchBar(null)
          win.setTouchBar(touchBar)
          win.setTouchBar(null)
          win.setTouchBar(touchBar)
        } catch (err) {
          cycleError = String(err && err.message)
        }
        rows.push({ label: 'setTouchBar cycle', data: { cycleError } })

        const problems = []
        if (!touchBar) problems.push('TouchBar が作れない')
        if (Object.keys(buttons).length !== 5) {
          problems.push('ボタンが5個ない: ' + Object.keys(buttons).length)
        }
        if (afterStarred !== '#/starred') {
          problems.push(`⭐️ 遷移先が ${afterStarred}`)
        }
        if (afterTrash !== '#/trashed') {
          problems.push(`🗑 遷移先が ${afterTrash}`)
        }
        if (afterHome !== '#/home') problems.push(`📒 遷移先が ${afterHome}`)
        if (!findBar) problems.push('🔍 で FindBar が開かない')
        if (!modal) problems.push('✎ でモーダルが開かない')
        if (cycleError) problems.push('setTouchBar cycle: ' + cycleError)

        const verdict =
          problems.length === 0
            ? 'PASS: 全ボタンが renderer を駆動し、setTouchBar 切替も無事故'
            : 'FAIL: ' + problems.join(' / ')
        finish(problems.length === 0 ? 0 : 1, { verdict })
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

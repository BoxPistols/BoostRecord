// スニペットノートの Markdown タブで Cmd/Ctrl+E のプレビュー切替が
// **往復するか**を実機で測る probe。
//
// ホットキーは Mousetrap が親ドキュメントに張っている。プレビューへ入ると
// focus が iframe に移るので、以降そのキーは親に届かず、切替が戻らない。
// 「初回だけ効く」という報告の正体（利用者からの報告）。
//
// 構文の指定はネイティブメニューなので probe から操作できない。
// ノートファイルを直接置いて Markdown タブのスニペットを用意する。
//
// Exit: 0 全部 PASS / 1 FAIL あり / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-snippetpreview-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-snippetpreview-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'nfolder', name: 'Notes', color: '#E10051' }],
    version: '1.0'
  })
)

// ノートは UI で作らせる。**事前に .cson を置いても効かない**——
// アプリは起動時に自前のフォルダキーを生成するので、こちらで書いた
// folder: "nfolder" が宙に浮いてノート一覧に出ない（既知の罠）。
// 構文の指定はネイティブメニューで probe から押せないため、
// 作らせたあとにファイル側で mode を Markdown に書き換えて読み直させる
const NOTE_CONTENT = '# index\n\n## zshrc\n\nM2Pro\n'

app.setPath('userData', path.join(tmpRoot, 'userData'))
app.setPath('home', tmpRoot)

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
  console.log('\n=== snippet preview toggle probe ===')
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
    if (localStorage.getItem('__snipPreviewSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__snipPreviewSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

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

// いま何が見えているか。
// **矩形の大小では判定できない。** MarkdownEditor は CodeEditor を DOM に
// 残したまま隠すので、どちらも幅・高さを持つ。実際に手前にあるものを
// elementFromPoint で取る（利用者が見ているものと同じ判定）
const VIEW_STATE = `(() => {
  const cm = document.querySelector('.CodeMirror')
  const iframe = document.querySelector('iframe')
  const box = (cm || iframe).getBoundingClientRect()
  const top = document.elementFromPoint(
    Math.round(box.x + box.width / 2),
    Math.round(box.y + box.height / 2)
  )
  const inEditor = !!(top && top.closest && top.closest('.CodeMirror'))
  const inPreview = !!(top && top.tagName === 'IFRAME')
  const active = document.activeElement
  return {
    topTag: top ? top.tagName : null,
    editorOnTop: inEditor,
    previewOnTop: inPreview,
    activeTag: active ? active.tagName : null,
    // 転送の切り分け用（null なら転送自体が起きていない）
    forwardedAt: window.__tbPreviewKey ? window.__tbPreviewKey.at : null
  }
})()`

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

        // --- スニペットノートを UI で作る ---
        const made = await wc.executeJavaScript(
          `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
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
             cm.CodeMirror.setValue(${JSON.stringify(NOTE_CONTENT)})
             await sleep(1500)
             return { ok:true }
           })()`,
          true
        )
        rows.push({ label: 'スニペットノートを作る', data: made })
        if (!made.ok) return finish(2, { error: made.step })

        // --- ファイル側で Markdown タブに変える ---
        const notesDir = path.join(storageDir, 'notes')
        const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.cson'))
        if (files.length !== 1) {
          return finish(2, { error: `notes=${files.length}（1件を期待）` })
        }
        const notePath = path.join(notesDir, files[0])
        const before = fs.readFileSync(notePath, 'utf8')
        const patched = before.replace('mode: null', 'mode: "Markdown"')
        if (patched === before) {
          return finish(2, { error: 'mode: null が見つからない' })
        }
        fs.writeFileSync(notePath, patched)
        rows.push({ label: 'Markdown タブへ書き換え', data: files[0] })

        wc.reload()
        await new Promise(resolve => setTimeout(resolve, 3500))

        const opened = await wc.executeJavaScript(
          `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
             for (let i=0;i<40;i++){
               const item = document.querySelector('[data-note-item]')
               if (item) { item.click(); break }
               await sleep(250)
             }
             for (let i=0;i<40;i++){
               if (document.querySelector('.CodeMirror')) break
               await sleep(250)
             }
             const cm = document.querySelector('.CodeMirror')
             return {
               ok: !!cm,
               isSnippet: !!document.querySelector('[class*="tabList"]'),
               mode: cm && cm.CodeMirror ? cm.CodeMirror.getOption('mode') : null,
               noteItems: document.querySelectorAll('[data-note-item]').length
             }
           })()`,
          true
        )
        rows.push({ label: 'Markdown タブのスニペットを開く', data: opened })
        if (!opened.ok) return finish(2, { error: 'ノートが開けない' })
        check(
          'スニペットノートである（測れている証拠）',
          opened.isSnippet === true,
          opened.isSnippet
        )
        // Markdown タブでないと MarkdownEditor が出ず、この probe は
        // 何も検証していないことになる
        check(
          'Markdown タブになっている（測れている証拠）',
          opened.mode === 'text/x-bfm',
          opened.mode
        )

        // エディタをクリックしてフォーカスを入れる
        const pos = await wc.executeJavaScript(
          `(() => { const cm = document.querySelector('.CodeMirror')
             const r = cm.getBoundingClientRect()
             return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + 30) } })()`,
          true
        )
        await clickAt(wc, pos.x, pos.y)

        const initial = await wc.executeJavaScript(VIEW_STATE, true)
        check(
          '最初はエディタが見えている',
          initial.editorOnTop && !initial.previewOnTop,
          initial
        )

        const SUPER = process.platform === 'darwin' ? 'cmd' : 'control'

        // --- 1回目: エディタ → プレビュー ---
        await press(wc, 'E', [SUPER])
        const after1 = await wc.executeJavaScript(VIEW_STATE, true)
        check(
          '1回目: プレビューへ切り替わる',
          after1.previewOnTop && !after1.editorOnTop,
          after1
        )

        // --- 2回目: プレビュー → エディタ（ここが壊れていた）---
        await press(wc, 'E', [SUPER])
        const after2 = await wc.executeJavaScript(VIEW_STATE, true)
        check(
          '**2回目: エディタへ戻る**',
          after2.editorOnTop && !after2.previewOnTop,
          after2
        )

        // --- 3回目・4回目: 何度でも往復する ---
        await press(wc, 'E', [SUPER])
        const after3 = await wc.executeJavaScript(VIEW_STATE, true)
        check('3回目: またプレビューへ', after3.previewOnTop, after3)

        await press(wc, 'E', [SUPER])
        const after4 = await wc.executeJavaScript(VIEW_STATE, true)
        check('4回目: またエディタへ', after4.editorOnTop, after4)

        // --- 検索中に切り替えたら数え直す ---
        // プレビューへの切替は MarkdownEditor 自身の state で起きるので、
        // 合図を購読していないと**切替前の件数と現在地が残り続ける**
        await press(wc, 'F', [SUPER])
        await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             const el = document.querySelector('.FindBar input')
             if (!el) return false
             const setter = Object.getOwnPropertyDescriptor(
               window.HTMLInputElement.prototype, 'value'
             ).set
             setter.call(el, 'index')
             el.dispatchEvent(new Event('input', { bubbles: true }))
             await sleep(500)
             return true
           })()`,
          true
        )
        const FIND_STATE = `(() => {
          const bar = document.querySelector('.FindBar')
          if (!bar) return { open: false }
          return {
            open: true,
            spans: Array.from(bar.querySelectorAll('span'))
              .map(s => (s.textContent || '').trim())
              .filter(Boolean),
            editorMarks: document.querySelectorAll('.CodeMirror .tb-find-all').length
          }
        })()`
        const findInEditor = await wc.executeJavaScript(FIND_STATE, true)
        check(
          '検索がエディタで数えられている（測れている証拠）',
          findInEditor.open &&
            findInEditor.spans.some(s => /\d+ \/ [1-9]/.test(s)) &&
            findInEditor.spans.some(s => /エディタ|Editor/.test(s)),
          findInEditor
        )
        await press(wc, 'E', [SUPER])
        await new Promise(resolve => setTimeout(resolve, 600))
        const findInPreview = await wc.executeJavaScript(FIND_STATE, true)
        check(
          '**切り替えたら探す対象が変わり、数え直す**',
          findInPreview.open &&
            findInPreview.spans.some(s => /プレビュー|Preview/.test(s)) &&
            findInPreview.editorMarks === 0,
          findInPreview
        )

        const img = await win.webContents.capturePage()
        const shot = path.join(
          process.env.TB_SHOT_DIR || os.tmpdir(),
          'snippet-preview-toggle.png'
        )
        fs.writeFileSync(shot, img.toPNG())
        rows.push({ label: 'SHOT', data: shot })

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

// Touch Bar のボタンが renderer を実際に動かすかを測る probe。
//
// Touch Bar ハードウェアは probe では押せないが、ボタンの click ハンドラは
// ただの関数なので直接呼び、renderer 側の結果（route 遷移 / FindBar /
// 新規ノートモーダル）を実測する。バーの視覚表示だけはユーザーの実機目視
// （このマシンでは BTT が Touch Bar を占有している点に注意）。
//
// 測ること:
//   1. build() がバー(ボタン12 + popover)を作る（Electron 28 実 API で崩れない）
//   2. ナビ4種（すべて/スター/ブックマーク/タグ）がそれぞれのルートへ遷移する
//      （ゴミ箱は不要の指示で撤去）
//   3. 検索 → FindBar、リンク → focusNoteLink（__tbNoteLink で観測）
//   4. 表示系トグル5種（一覧/情報/目次/モード/プレビュー）が実際に画面を変える
//   5. 新規 → ノート種別モーダルが開く
//   6. グリフアイコンが実 nativeImage として読める（PNG 生成漏れの検知）
//   7. setTouchBar(bar/null) の focus/blur サイクルが例外を出さない
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

        // グリフアイコンが実 nativeImage として読めているか（モックでなく
        // 実 Electron で確かめる。PNG の生成漏れ・パス誤りはここで出る）
        const glyphNames = [
          'allNotes',
          'starredNotes',
          'bookmarks',
          'tags',
          'find',
          'noteLink',
          'newNote'
        ]
        const iconless = glyphNames.filter(n => {
          const icon = buttons[n] && buttons[n].icon
          return !icon || icon.isEmpty()
        })
        // template 判定は Electron の getter が別インスタンスを返す可能性が
        // あるので参考値に留める（verdict には使わない）
        const nonTemplate = glyphNames.filter(n => {
          const icon = buttons[n] && buttons[n].icon
          return icon && !icon.isEmpty() && !icon.isTemplateImage()
        })
        rows.push({
          label: 'glyph icons',
          data: { checked: glyphNames.length, iconless, nonTemplate }
        })

        const hash = () =>
          wc.executeJavaScript('location.hash.split("?")[0]', true)

        // --- 2. ナビゲーション5ボタン ---
        actions.starredNotes()
        await sleep(600)
        const afterStarred = await hash()
        actions.bookmarks()
        await sleep(600)
        const afterBookmarks = await hash()
        actions.tags()
        await sleep(600)
        const afterTags = await hash()
        actions.allNotes()
        await sleep(600)
        const afterHome = await hash()
        rows.push({
          label: 'navigate',
          data: {
            afterStarred,
            afterBookmarks,
            afterTags,
            afterHome
          }
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

        // --- 3b. 🔗 → ノートリンクへフォーカス（app が __tbNoteLink を残す）---
        actions.noteLink()
        await sleep(800)
        const noteLink = await wc.executeJavaScript(
          `(() => ({
             called: !!(window.__tbNoteLink && window.__tbNoteLink.called),
             field: !!document.querySelector('[data-note-link]')
           }))()`,
          true
        )
        rows.push({ label: 'noteLink', data: noteLink })

        // --- 3c. 表示系トグル（呼ぶ→変化を測る→呼び直して復元）---
        const measureView = () =>
          wc.executeJavaScript(
            `(() => {
               const p = document.querySelector('.infoPanel')
               const nl = document.querySelector('.NoteList')
               const toc = document.querySelector('[class*="body-toc"]')
               const pressed = document.querySelector(
                 'button[aria-pressed="true"] i.fa'
               )
               return {
                 info: !!(p && p.style && p.style.display !== 'none'),
                 noteListW: nl ? Math.round(nl.getBoundingClientRect().width) : null,
                 toc: !!(toc && toc.getBoundingClientRect().width > 0),
                 mode: pressed ? pressed.className : null
               }
             })()`,
            true
          )
        const toggles = {}
        const flip = async (name, restoreCount) => {
          const before = await measureView()
          actions[name]()
          await sleep(700)
          const after = await measureView()
          for (let i = 0; i < restoreCount; i++) {
            actions[name]()
            await sleep(700)
          }
          toggles[name] = { before, after }
        }
        await flip('toggleInfo', 1)
        await flip('toggleToc', 1)
        await flip('toggleNoteList', 2) // 3状態サイクル(通常→折畳→非表示)
        await flip('togglePreview', 1)
        await flip('toggleMode', 2) // 3値サイクルなので2回で元に戻る
        rows.push({ label: 'view toggles', data: toggles })

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
        if (Object.keys(buttons).length !== 12) {
          problems.push('ボタンが12個ない: ' + Object.keys(buttons).length)
        }
        if (iconless.length) {
          problems.push('アイコンが読めないボタン: ' + iconless.join(', '))
        }
        if (afterStarred !== '#/starred') {
          problems.push(`スター 遷移先が ${afterStarred}`)
        }
        if (afterBookmarks !== '#/bookmarked') {
          problems.push(`ブックマーク 遷移先が ${afterBookmarks}`)
        }
        if (afterTags !== '#/alltags') {
          problems.push(`タグ 遷移先が ${afterTags}`)
        }
        if (afterHome !== '#/home')
          problems.push(`すべて 遷移先が ${afterHome}`)
        if (!findBar) problems.push('検索 で FindBar が開かない')
        if (!noteLink.called)
          problems.push('リンク で focusNoteLink が呼ばれない')
        if (toggles.toggleInfo.before.info === toggles.toggleInfo.after.info) {
          problems.push('情報パネルが切り替わらない')
        }
        if (toggles.toggleToc.before.toc === toggles.toggleToc.after.toc) {
          problems.push('目次が切り替わらない')
        }
        if (
          toggles.toggleNoteList.before.noteListW ===
          toggles.toggleNoteList.after.noteListW
        ) {
          problems.push('ノート一覧が切り替わらない')
        }
        if (
          toggles.togglePreview.before.mode === toggles.togglePreview.after.mode
        ) {
          problems.push('プレビュー切替でモードが変わらない')
        }
        if (toggles.toggleMode.before.mode === toggles.toggleMode.after.mode) {
          problems.push('モード切替でモードが変わらない')
        }
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

// 実入力による総合検証。
//
// 経緯: これまでの probe は renderer 内で `dispatchEvent(new KeyboardEvent(...))`
// を使っていた。合成イベントは
//   - 既定動作を起こさない（mousedown 後の macOS のフォーカス移動が再現されない）
//   - 指定した要素から伝播が始まる（実際のフォーカス位置を経由しない）
// ため、実機で壊れているものが probe では緑になり続けた（Tab 移動で4回連続）。
//
// ここでは webContents.sendInputEvent() を使う。ブラウザ層に入力を注入するので、
// 既定動作もフォーカス経路も本物と同じになる。「押した通りに動くか」を測れる。
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-realinput-result.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-realinput-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [
      { key: 'f1', name: 'Alpha', color: '#E10051' },
      { key: 'f2', name: 'Beta', color: '#2BA5F7' }
    ],
    version: '1.0'
  })
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
setTimeout(() => finish(3, { error: 'watchdog' }), 120000)

const sleep = ms => new Promise(r => setTimeout(r, ms))

function seed() {
  return `(() => { let l=[]; try{l=JSON.parse(localStorage.getItem('storages'))||[]}catch(e){}
    if(!Array.isArray(l)||!l.length){localStorage.setItem('storages',JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]));setTimeout(()=>location.reload(),50);return false} return true })()`
}

function waitReady() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
    return !!document.querySelector('.SideNav')
  })()`
}

// --- 実入力ヘルパー -------------------------------------------------------

async function pressKey(wc, keyCode, modifiers = []) {
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  await sleep(300)
}

async function clickAt(wc, x, y) {
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
  await sleep(300)
}

// 画面上の要素の中心座標を取る（実入力は座標指定なので必須）
function centerOf(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`
}

function focusInfo() {
  return `(() => {
    const a = document.activeElement
    const nav = document.querySelector('.SideNav')
    const list = document.querySelector('[data-note-list]')
    return {
      tag: a ? a.tagName : null,
      inSideNav: !!(a && nav && (a === nav || nav.contains(a))),
      inNoteList: !!(a && list && (a === list || list.contains(a))),
      inEditor: !!(a && a.closest && a.closest('.CodeMirror'))
    }
  })()`
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

        const rep = {}
        rep.uiReady = await wc.executeJavaScript(waitReady(), true)
        if (!rep.uiReady)
          return finish(1, { ok: false, rep, error: 'SideNav never mounted' })

        // --- 1. エディタにフォーカスを置いてから、サイドバーを実クリック ---
        const editorPos = await wc.executeJavaScript(
          centerOf('.CodeMirror'),
          true
        )
        if (editorPos) await clickAt(wc, editorPos.x, editorPos.y)
        rep.afterEditorClick = await wc.executeJavaScript(focusInfo(), true)

        const navPos = await wc.executeJavaScript(
          centerOf('.SideNav button'),
          true
        )
        if (!navPos)
          return finish(1, { ok: false, rep, error: 'no nav button' })
        await clickAt(wc, navPos.x, navPos.y)
        rep.afterSideNavClick = await wc.executeJavaScript(focusInfo(), true)

        // --- 2. 実キーの Tab でノート一覧へ移るか ---
        await pressKey(wc, 'Tab')
        rep.afterTab = await wc.executeJavaScript(focusInfo(), true)
        rep.afterTabTrace = await wc.executeJavaScript(
          '(() => window.__tbPaneTab || null)()',
          true
        )

        // --- 3. 実キーの Shift+Tab でサイドバーへ戻るか ---
        await pressKey(wc, 'Tab', ['shift'])
        rep.afterShiftTab = await wc.executeJavaScript(focusInfo(), true)

        // --- 4. サイドバーで実キーの ↓ がフォルダ選択を動かすか ---
        const before = await wc.executeJavaScript('location.hash', true)
        await pressKey(wc, 'Down')
        const after = await wc.executeJavaScript('location.hash', true)
        rep.sidebarArrowDown = { before, after, moved: before !== after }

        // --- 5. エディタにフォーカスがある時、Tab を奪わないか ---
        if (editorPos) {
          await clickAt(wc, editorPos.x, editorPos.y)
          const beforeEditor = await wc.executeJavaScript(focusInfo(), true)
          await pressKey(wc, 'Tab')
          const afterEditor = await wc.executeJavaScript(focusInfo(), true)
          rep.tabInEditor = {
            startedInEditor: beforeEditor.inEditor,
            stillInEditor: afterEditor.inEditor
          }
        }

        // --- 6. ホットキー（Cmd/Ctrl+Shift+B）でノート一覧が開閉するか ---
        const listWidth = () =>
          wc.executeJavaScript(
            `(() => { const el=document.querySelector('[data-note-list]'); return el ? Math.round(el.getBoundingClientRect().width) : -1 })()`,
            true
          )
        const w0 = await listWidth()
        await pressKey(wc, 'B', ['cmd', 'shift'])
        const w1 = await listWidth()
        await pressKey(wc, 'B', ['cmd', 'shift'])
        const w2 = await listWidth()
        rep.hotkeyToggle = {
          before: w0,
          folded: w1,
          restored: w2,
          toggled: w0 !== w1,
          restoredOk: w0 === w2
        }

        // --- 7. Cmd+数字 でノート一覧の N 番目へ飛ぶか ---
        const listPos = await wc.executeJavaScript(
          centerOf('[data-note-list]'),
          true
        )
        if (listPos) await clickAt(wc, listPos.x, listPos.y)
        const selBefore = await wc.executeJavaScript('location.hash', true)
        await pressKey(wc, '2', ['cmd'])
        const selAfter = await wc.executeJavaScript('location.hash', true)
        rep.cmdDigitJump = {
          before: selBefore,
          after: selAfter,
          moved: selBefore !== selAfter
        }

        // --- 8. 幅のスライダーを実ドラッグできるか ---
        const wBefore = await listWidth()
        const sliderPos = await wc.executeJavaScript(
          centerOf('#main-body > div[class*="slider-right"]'),
          true
        )
        if (!sliderPos) {
          rep.sliderDrag = { error: 'slider not found' }
          return finish(0, { rep })
        }
        // スライダー本体は 1px。中心はちょうど NoteDetail の左端に重なるので、
        // ヒットボックス（left -3px / width 7px）の内側へ寄せる
        const sliderX = sliderPos.x - 2
        const sliderY = sliderPos.y
        wc.sendInputEvent({
          type: 'mouseDown',
          x: sliderX,
          y: sliderY,
          button: 'left',
          clickCount: 1
        })
        await sleep(200)
        // mousedown がスライダーに当たったか（当たっていなければ座標の問題）
        rep.sliderMouseDown = await wc.executeJavaScript(
          '(() => { const el = document.elementFromPoint(' +
            sliderX +
            ',' +
            sliderY +
            '); return { hit: el ? String(el.className || el.tagName) : null,' +
            ' dragging: !!window.__tbSliderDragging } })()',
          true
        )
        wc.sendInputEvent({ type: 'mouseMove', x: sliderX + 90, y: sliderY })
        await sleep(200)
        wc.sendInputEvent({
          type: 'mouseUp',
          x: sliderX + 90,
          y: sliderY,
          button: 'left',
          clickCount: 1
        })
        await sleep(400)
        const wAfter = await listWidth()
        rep.sliderDrag = {
          before: wBefore,
          after: wAfter,
          widened: wAfter > wBefore
        }

        // 期待どおりでない項目があれば非ゼロで終える（CI が落ちる）
        const checks = {
          'click moves focus into sidebar': rep.afterSideNavClick.inSideNav,
          'Tab moves to note list': rep.afterTab.inNoteList,
          'Shift+Tab returns to sidebar': rep.afterShiftTab.inSideNav,
          'arrow key moves folder selection': rep.sidebarArrowDown.moved,
          'Tab is not stolen from the editor': rep.tabInEditor
            ? rep.tabInEditor.stillInEditor
            : false,
          'hotkey toggles the note list': rep.hotkeyToggle.toggled,
          'hotkey restores the width': rep.hotkeyToggle.restoredOk,
          'Cmd+digit jumps to a note': rep.cmdDigitJump.moved,
          'slider drag resizes the pane': rep.sliderDrag.widened
        }
        const failed = Object.keys(checks).filter(k => !checks[k])
        rep.checks = checks
        rep.failed = failed
        finish(failed.length ? 1 : 0, { ok: failed.length === 0, rep })
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4500)
  })
})

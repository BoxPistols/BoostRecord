// Real-renderer probe (main process) for the snippet tab shortcuts and the
// collapsed description.
//
// 実キー入力 (webContents.sendInputEvent) で以下を確認する:
//   1. description が既定で 1 行に畳まれ、タブが上に詰まっている
//   2. 修飾キー長押しでタブに 1..9 のバッジが出る
//   3. 修飾キー + 3 で 3 枚目のタブへ飛ぶ
//   4. 修飾キー + Shift + [ / ] で左右のタブへ移動する
//   5. トグルで description が広がり、タブがその分だけ下がる
//
// Run: TB_E2E_PROBE=dev-scripts/e2e-snippettab-probe.js \
//      TB_E2E_RESULT=/tmp/snippettab-result.json electron .
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-snippettab-result.json')
const SHOT_DIR = process.env.TB_E2E_SHOTS || os.tmpdir()

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-snippettab-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'f1', name: 'Alpha', color: '#E10051' }],
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
    const rep = (result && result.rep) || {}
    if (rep.checks) {
      Object.keys(rep.checks).forEach(k => {
        console.log((rep.checks[k] ? 'PASS ' : 'FAIL ') + k)
      })
    }
    if (result && result.error) console.log('ERROR: ' + result.error)
    console.log('REPORT ' + JSON.stringify(rep))
  } catch (e) {}
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, result }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 120000)

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// アプリ側は Mac で metaKey、それ以外で ctrlKey を見る（browser/lib/metaKeyHold）
const isMac = process.platform === 'darwin'
const PRIMARY = isMac ? 'cmd' : 'control'
const PRIMARY_KEY = isMac ? 'Cmd' : 'Control'

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

async function pressKey(wc, keyCode, modifiers = []) {
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  await sleep(500)
}

async function clickAt(wc, x, y) {
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
  await sleep(350)
}

function centerOf(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`
}

// CSS Modules でクラス名はハッシュ化される。元の名前は残るので部分一致で引く
function layout() {
  return `(() => {
    const detail = document.querySelector('.NoteDetail')
    if (!detail) return null
    const desc = detail.querySelector('[class*="description"]:not([class*="toggle"])')
    const tabList = detail.querySelector('[class*="tabList"]')
    const tabs = Array.from(detail.querySelectorAll('[class*="tabList"] [class*="allTabs"] > div'))
    const rect = sel => {
      const el = detail.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const base = detail.getBoundingClientRect()
      return { top: Math.round(r.top - base.top), bottom: Math.round(r.bottom - base.top) }
    }
    return {
      tabCount: tabs.length,
      renamingTabs: detail.querySelectorAll('[class*="tabList"] input').length,
      header: {
        folder: rect('[class*="info-left-top-folderSelect"]'),
        tags: rect('.TagSelect'),
        info: rect('[class*="info"]'),
        body: rect('[class*="body"]')
      },
      activeIndex: tabs.findIndex(t => /root--active/.test(t.className)),
      badges: detail.querySelectorAll('[class*="jump-hint"]').length,
      badgeLabels: Array.from(detail.querySelectorAll('[class*="jump-hint"]')).map(b => b.textContent),
      descriptionHeight: desc ? Math.round(desc.getBoundingClientRect().height) : -1,
      tabsTop: tabList ? Math.round(tabList.offsetTop) : -1
    }
  })()`
}

async function shot(wc, name) {
  try {
    const img = await wc.capturePage()
    fs.writeFileSync(
      path.join(SHOT_DIR, 'snippettab-' + name + '.png'),
      img.toPNG()
    )
  } catch (e) {}
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true

        // window は表示しない（lib/main-window.js が probe 時は show:false）。
        // sendInputEvent は OS のフォーカスに関係なくレンダラへ直接届くので、
        // webContents 側だけ focus しておけば実キー入力の検証はできる
        wc.focus()

        const rep = { checks: {} }
        rep.uiReady = await wc.executeJavaScript(waitReady(), true)
        if (!rep.uiReady)
          return finish(1, { ok: false, rep, error: 'SideNav never mounted' })

        // --- スニペットノートを作る ---
        await wc.executeJavaScript(
          `document.querySelector('.NewNoteButton button').click()`,
          true
        )
        // モーダルの描画は初回起動だと 800ms では間に合わない run がある
        const made = await wc.executeJavaScript(
          `(async () => {
            const sleep = ms => new Promise(r => setTimeout(r, ms))
            for (let i = 0; i < 30; i++) {
              const modal = document.querySelector('.ModalBase') || document
              const btn = Array.from(modal.querySelectorAll('button'))
                .find(b => /snippet|スニペット/i.test(b.textContent))
              if (btn) { btn.click(); return true }
              await sleep(200)
            }
            return false
          })()`,
          true
        )
        if (!made)
          return finish(1, { ok: false, rep, error: 'no Snippet Note button' })
        await sleep(1200)

        // --- タブを 3 枚にする ---
        // ここは検証対象ではなく前準備なので JS クリックで足す
        const addTab = `(() => {
          const btns = Array.from(document.querySelectorAll('.NoteDetail [class*="tabButton"]'))
          const plus = btns.find(b => b.querySelector('.fa-plus'))
          if (!plus) return -1
          plus.click()
          return 1
        })()`
        // + の直後はリネーム入力が開く。blur() は「今フォーカスされている」
        // 時しかイベントを出さないので、Enter の keydown を直接投げて閉じる
        // （フォーカスがどこにあっても確実に確定できる）
        const commitRename = `(async () => {
          const sleep = ms => new Promise(r => setTimeout(r, ms))
          const find = () => Array.from(document.querySelectorAll('.NoteDetail [class*="tabList"] input'))
          for (let i = 0; i < 20; i++) {
            const inputs = find()
            if (!inputs.length) return true
            inputs.forEach(input => input.dispatchEvent(
              new KeyboardEvent('keydown', { keyCode: 13, key: 'Enter', bubbles: true })
            ))
            await sleep(150)
          }
          return !find().length
        })()`
        for (let i = 0; i < 2; i++) {
          const added = await wc.executeJavaScript(addTab, true)
          if (added !== 1)
            return finish(1, { ok: false, rep, error: 'no + tab button' })
          await sleep(400)
          rep['renameCommitted' + i] = await wc.executeJavaScript(
            commitRename,
            true
          )
          await sleep(300)
        }

        // --- 1. 既定は畳んだ description ---
        // バッジは詳細ペインにフォーカスがある時だけ出る。クリックが
        // 効いたかを見てから進めないと、そこだけ落ちる run が混ざる
        const focusInDetail = `(() => {
          const a = document.activeElement
          const root = document.querySelector('.NoteDetail')
          return {
            inDetail: !!(a && root && (a === root || root.contains(a))),
            tag: a ? a.tagName : null,
            cls: a ? String(a.className).slice(0, 60) : null
          }
        })()`
        const editorPos = await wc.executeJavaScript(
          centerOf('.NoteDetail .CodeMirror'),
          true
        )
        for (let i = 0; i < 5; i++) {
          if (editorPos) await clickAt(wc, editorPos.x, editorPos.y)
          rep.focusBeforeHold = await wc.executeJavaScript(focusInDetail, true)
          if (rep.focusBeforeHold && rep.focusBeforeHold.inDetail) break
          await sleep(300)
        }
        rep.checks.detailFocused =
          !!rep.focusBeforeHold && rep.focusBeforeHold.inDetail === true

        rep.collapsed = await wc.executeJavaScript(layout(), true)
        await shot(wc, 'collapsed')
        rep.checks.threeTabs = rep.collapsed && rep.collapsed.tabCount === 3
        rep.checks.descriptionCollapsed =
          !!rep.collapsed &&
          rep.collapsed.descriptionHeight > 0 &&
          rep.collapsed.descriptionHeight < 40 &&
          rep.collapsed.tabsTop > 0 &&
          rep.collapsed.tabsTop < 60

        // --- 2. 修飾キー長押しでバッジ ---
        wc.sendInputEvent({ type: 'keyDown', keyCode: PRIMARY_KEY })
        await sleep(400)
        rep.held = await wc.executeJavaScript(layout(), true)
        rep.holdTrace = await wc.executeJavaScript(
          '(() => window.__tbSnippetJumpHints || null)()',
          true
        )
        await shot(wc, 'jump-hints')
        wc.sendInputEvent({ type: 'keyUp', keyCode: PRIMARY_KEY })
        await sleep(300)
        rep.released = await wc.executeJavaScript(layout(), true)
        rep.checks.badgesWhileHeld = !!rep.held && rep.held.badges === 3
        rep.checks.badgesLabelled =
          !!rep.held &&
          JSON.stringify(rep.held.badgeLabels) ===
            JSON.stringify(['1', '2', '3'])
        rep.checks.badgesGoneOnRelease =
          !!rep.released && rep.released.badges === 0

        // --- 3. 修飾キー + 1 / + 3 でタブへ直接飛ぶ ---
        // 直前の状態がたまたま一致して緑になるのを避けるため、往復させる
        await pressKey(wc, '1', [PRIMARY])
        rep.afterJump1 = await wc.executeJavaScript(layout(), true)
        rep.checks.jumpToFirstTab =
          !!rep.afterJump1 && rep.afterJump1.activeIndex === 0

        await pressKey(wc, '3', [PRIMARY])
        rep.afterJump3 = await wc.executeJavaScript(layout(), true)
        rep.checks.jumpToThirdTab =
          !!rep.afterJump3 && rep.afterJump3.activeIndex === 2

        // --- 4. 修飾キー + Shift + [ / ] ---
        await pressKey(wc, '[', [PRIMARY, 'shift'])
        rep.afterPrev = await wc.executeJavaScript(layout(), true)
        rep.checks.prevTabWithBracket =
          !!rep.afterPrev && rep.afterPrev.activeIndex === 1

        await pressKey(wc, ']', [PRIMARY, 'shift'])
        rep.afterNext = await wc.executeJavaScript(layout(), true)
        rep.checks.nextTabWithBracket =
          !!rep.afterNext && rep.afterNext.activeIndex === 2

        // --- 5. トグルで description が広がり、タブが下がる ---
        const togglePos = await wc.executeJavaScript(
          centerOf('.NoteDetail [class*="description-toggle"]'),
          true
        )
        if (!togglePos)
          return finish(1, {
            ok: false,
            rep,
            error: 'no description toggle button'
          })
        await clickAt(wc, togglePos.x, togglePos.y)
        rep.expanded = await wc.executeJavaScript(layout(), true)
        await shot(wc, 'expanded')
        rep.checks.descriptionExpands =
          !!rep.expanded &&
          !!rep.collapsed &&
          rep.expanded.descriptionHeight > rep.collapsed.descriptionHeight &&
          rep.expanded.tabsTop > rep.collapsed.tabsTop

        await clickAt(wc, togglePos.x, togglePos.y)
        rep.recollapsed = await wc.executeJavaScript(layout(), true)
        rep.checks.descriptionCollapsesAgain =
          !!rep.recollapsed &&
          !!rep.collapsed &&
          rep.recollapsed.tabsTop === rep.collapsed.tabsTop

        const pass = Object.keys(rep.checks).every(k => rep.checks[k] === true)
        finish(pass ? 0 : 1, { ok: pass, rep })
      } catch (err) {
        finish(2, { error: 'probe failed: ' + (err && err.message) })
      }
    }, 4000)
  })
})

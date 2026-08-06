// ⚠️ このファイルは dispatchEvent（合成イベント）で観測する。
// キーボード・マウス操作の検証には **使ってはいけない**:
//   - 既定動作が走らない（macOS は mousedown でフォーカスを body へ戻す）
//   - 指定した要素から伝播が始まる（実際のフォーカス位置を経由しない）
//   - 途中の stopPropagation() を通らない
// 実際に壊れているものが緑になり続けた（Tab 移動で4回連続の誤報告）。
// 入力の検証は dev-scripts/e2e-realinput-probe.js（sendInputEvent）を使う。
// ここは DOM の状態やモジュール配線の観測にのみ使う。
//
// Real-renderer probe for two reports:
//   1. 「Tab移動出来ない」— サイドバー → ノート一覧の Tab 移動
//   2. 「フォルダの色変更ができなくなってる」— 右クリック→色変更モーダル
//
// どちらも「クリックでフォーカスが入るか」「モーダルが実際に DOM に出るか」
// という実描画でしか確かめられない挙動なので、本物のレンダラーで測る。
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-navfocus-result.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-navfocus-'))
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
setTimeout(() => finish(3, { error: 'watchdog' }), 90000)

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

// 実アプリの流れを再現する: エディタにフォーカスがある状態で
// サイドバーのフォルダをクリック → Tab。これが本来の使い方であり、
// 「フォーカスを外してから」の計測では拾えなかった経路。
function realFlowClickThenTab() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const cm = document.querySelector('.CodeMirror textarea') ||
               document.querySelector('.CodeMirror')
    if (cm && cm.focus) cm.focus()
    await sleep(200)
    const startedInEditor = !!(document.activeElement &&
      document.activeElement.closest && document.activeElement.closest('.CodeMirror'))

    const nav = document.querySelector('.SideNav')
    const btn = nav && nav.querySelector('button')
    if (btn) {
      btn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}))
      btn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}))
      btn.click()
    }
    await sleep(300)
    const focusInNavAfterClick = !!(document.activeElement && nav &&
      nav.contains(document.activeElement))

    window.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', bubbles:true}))
    await sleep(300)
    const list = document.querySelector('[data-note-list]')
    const active = document.activeElement
    return {
      startedInEditor,
      focusInNavAfterClick,
      focusOnNoteList: !!(list && (active === list || list.contains(active))),
      activeAfter: active ? active.tagName : null
    }
  })()`
}

// フォーカスがどこにも無い状態（body）から Tab を投げ、ノート一覧へ移るか。
// 「クリックしてフォーカスを入れてから」を前提にしない設計になっているかを測る
function tabFromBody() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    document.activeElement && document.activeElement.blur()
    document.body.focus()
    const before = document.activeElement ? document.activeElement.tagName : null
    window.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', bubbles:true}))
    await sleep(250)
    const list = document.querySelector('[data-note-list]')
    const active = document.activeElement
    return {
      activeBefore: before,
      focusOnNoteList: !!(list && (active === list || list.contains(active))),
      activeAfter: active ? active.tagName : null
    }
  })()`
}

// 続けて Shift+Tab でサイドバーへ戻るか
function shiftTabBack() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    // 起点をノート一覧に固定してから測る（前段の状態に依存させない）
    const list0 = document.querySelector('[data-note-list]')
    if (list0) list0.focus()
    await sleep(150)
    window.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', shiftKey:true, bubbles:true}))
    await sleep(250)
    const nav = document.querySelector('.SideNav')
    const active = document.activeElement
    return {
      focusOnSideNav: !!(nav && (active === nav || nav.contains(active))),
      activeAfter: active ? active.tagName : null
    }
  })()`
}

// 文字入力中の Tab は奪わないこと（インデント等の本来の意味を保つ）
function tabInsideInput() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await sleep(150)
    const focusedRight = document.activeElement === input
    window.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', bubbles:true}))
    await sleep(200)
    const active = document.activeElement
    const stillInput = active === input
    const info = {
      tabNotStolenFromInput: stillInput,
      focusedBefore: focusedRight,
      activeTag: active ? active.tagName : null,
      activeIsNoteList: !!(active && active.hasAttribute && active.hasAttribute('data-note-list'))
    }
    input.remove()
    return info
  })()`
}

// ホットキー設定（config.hotkey.toggleNoteList）で束ねた Cmd+Shift+B が
// 実際にペインを開閉するか。メニューの accelerator を外したので、
// mousetrap 側だけで成立していることを確かめる
function toggleNoteListByHotkey() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const width = () => {
      const el = document.querySelector('[data-note-list]')
      return el ? Math.round(el.getBoundingClientRect().width) : -1
    }
    const before = width()
    const send = () => {
      const ev = {key:'B', code:'KeyB', keyCode:66, which:66,
        metaKey:true, shiftKey:true, bubbles:true}
      document.dispatchEvent(new KeyboardEvent('keydown', ev))
      document.dispatchEvent(new KeyboardEvent('keyup', ev))
    }
    send(); await sleep(500)
    const after = width()
    send(); await sleep(500)
    const restored = width()
    return { before, after, restored, toggled: before !== after, restoredOk: restored === before }
  })()`
}

// 途中の要素が stopPropagation() しても Tab が届くか。bubble で受けていた頃は
// ここで止まり、ハンドラが一度も走らなかった（実機で __tbPaneTab が undefined）
function tabSurvivesStopPropagation() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const nav = document.querySelector('.SideNav')
    if (nav) nav.focus()
    await sleep(150)
    window.__tbPaneTab = undefined

    // document で伝播を止める意地悪な購読者を挟む
    const blocker = ev => ev.stopPropagation()
    document.addEventListener('keydown', blocker, false)
    nav.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', bubbles:true}))
    await sleep(250)
    document.removeEventListener('keydown', blocker, false)

    const t = window.__tbPaneTab
    const list = document.querySelector('[data-note-list]')
    const active = document.activeElement
    return {
      handlerRan: !!t,
      decision: t ? t.decision : null,
      focusOnNoteList: !!(list && (active === list || list.contains(active)))
    }
  })()`
}

// サイドバーの上下キーでフォルダ選択が動くか
function sidebarArrowKeys() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const nav = document.querySelector('.SideNav')
    if (!nav) return { error: 'no SideNav' }
    nav.focus()
    await sleep(150)
    const before = location.hash + location.pathname
    nav.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown', bubbles:true}))
    await sleep(300)
    const after = location.hash + location.pathname
    return { before, after, moved: before !== after }
  })()`
}

// フォルダ色モーダルが実際に開くか。context menu は native なので、
// ハンドラを直接叩けない代わりに modal 経由の DOM 出現を測る。
function openFolderColorModalAndReport() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const nav = document.querySelector('.SideNav')
    if (!nav) return { error: 'no SideNav' }
    // StorageItem は SortableContainer に包まれ、フォルダを畳んでいると
    // ボタンも出ない。SideNav ルートの fiber から下方向に総当たりで探す
    const rootKey = Object.keys(nav).find(k => k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber'))
    if (!rootKey) return { error: 'no fiber key on SideNav' }
    let inst = null
    const stack = [nav[rootKey]]
    const seen = new Set()
    while (stack.length && !inst) {
      const f = stack.pop()
      if (!f || seen.has(f)) continue
      seen.add(f)
      const sn = f.stateNode
      if (sn && typeof sn.handleFolderColorClick === 'function') { inst = sn; break }
      if (f.child) stack.push(f.child)
      if (f.sibling) stack.push(f.sibling)
    }
    if (!inst) return { error: 'StorageItem instance not found' }

    const folder = (inst.props.storage.folders || [])[0]
    if (!folder) return { error: 'storage has no folder' }
    inst.handleFolderColorClick(folder, { x: 100, y: 200 })
    await sleep(600)

    // フォルダ色は**モーダルではなくポップオーバー**（FolderColorPopover が
    // createPortal で body 直下に role="dialog" を出す）。以前は
    // data-modal / [data-modal-swatch] / .sketch-picker を見ており、
    // 実装と噛み合わないまま常に false を返していた。しかもこの結果は
    // ok 判定に入っていなかったので、ずっと緑のまま気づけなかった
    // 固有の目印で引く。role="dialog" だけだと別のダイアログを掴んで
    // 通ってしまい、検証がまた嘘をつく
    const dialog = document.querySelector('[data-folder-color-popover]')
    const swatches = dialog ? dialog.querySelectorAll('button') : []
    return {
      opened: !!dialog,
      swatchCount: swatches.length,
      label: dialog ? dialog.getAttribute('aria-label') : null
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

        const rep = {}
        const ready = await wc.executeJavaScript(waitReady(), true)
        rep.uiReady = ready
        if (!ready)
          return finish(1, { ok: false, rep, error: 'SideNav never mounted' })

        rep.realFlow = await wc.executeJavaScript(realFlowClickThenTab(), true)
        rep.tabFromBody = await wc.executeJavaScript(tabFromBody(), true)
        rep.shiftTabBack = await wc.executeJavaScript(shiftTabBack(), true)
        rep.tabInsideInput = await wc.executeJavaScript(tabInsideInput(), true)
        rep.stopPropagation = await wc.executeJavaScript(
          tabSurvivesStopPropagation(),
          true
        )
        rep.sidebarArrows = await wc.executeJavaScript(sidebarArrowKeys(), true)
        rep.hotkeyToggle = await wc.executeJavaScript(
          toggleNoteListByHotkey(),
          true
        )
        rep.folderColorModal = await wc.executeJavaScript(
          openFolderColorModalAndReport(),
          true
        )

        // 測っているのに判定へ入れないと、壊れても緑のまま通る
        const ok =
          rep.tabFromBody.focusOnNoteList &&
          rep.shiftTabBack.focusOnSideNav &&
          rep.tabInsideInput.tabNotStolenFromInput &&
          !!rep.folderColorModal.opened &&
          rep.folderColorModal.swatchCount > 0
        finish(ok ? 0 : 1, { ok, rep })
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

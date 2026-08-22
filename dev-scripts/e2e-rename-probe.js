// ダブルクリックのその場改名を**実入力**で検証する。
//
// 合成イベント(dispatchEvent)ではなく webContents.sendInputEvent を使う
// （合成イベントは既定動作・フォーカス経路が本物と違い、4回連続の誤報告の
// 原因になった）。dblclick → タイプ → Enter の全経路を通し、画面と
// boostnote.json の両方で結果を確かめる。親の改名は子孫パスの
// カスケードまで見る。
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const CSON = require('@rokt33r/season')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-rename.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-rename-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [
      { key: 'parent1', name: 'Base', color: '#E10051' },
      { key: 'child1', name: 'Base/child', color: '#2BA5F7' }
    ],
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
  console.log('\n=== inline rename probe ===')
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function seed() {
  return `(() => {
    if (localStorage.getItem('__renameSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__renameSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

function waitReady() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
    return !!document.querySelector('.SideNav')
  })()`
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

async function doubleClickAt(wc, x, y) {
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 2 })
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 2 })
  await sleep(500)
}

async function typeText(wc, text) {
  for (const ch of text) {
    wc.sendInputEvent({ type: 'keyDown', keyCode: ch })
    wc.sendInputEvent({ type: 'char', keyCode: ch })
    wc.sendInputEvent({ type: 'keyUp', keyCode: ch })
  }
  await sleep(200)
}

app.on('browser-window-created', (_e, win) => {
  if (ran) return
  ran = true
  const wc = win.webContents
  wc.on('did-finish-load', async () => {
    try {
      if (finished) return
      const seeded = await wc.executeJavaScript(seed(), true)
      if (!seeded) return
      const ready = await wc.executeJavaScript(waitReady(), true)
      if (!ready) return finish(2, { error: 'UI not ready' })
      await sleep(1200)
      win.focus()
      wc.focus()

      // 親フォルダ行（"Base"）を実座標でダブルクリック
      const rowSel = '.SideNav button[class*="folderList-item"]'
      const pos = await wc.executeJavaScript(centerOf(rowSel), true)
      rows.push({ label: 'folder row', data: pos })
      if (!pos) return finish(2, { error: 'folder row not found' })
      // 届いたイベントを記録するスパイ（座標ズレ / dblclick 不成立の切り分け）
      await wc.executeJavaScript(
        `(() => {
          window.__spy = []
          window.__focusLog = []
          document.addEventListener('focusin', e => {
            window.__focusLog.push(
              Math.round(performance.now()) + ':' + e.target.tagName + '.' +
              String(e.target.className || '').slice(0, 30))
          }, true)
          ;['mousedown','click','dblclick'].forEach(t =>
            document.addEventListener(t, e => {
              window.__spy.push(t + '@' + (e.target.tagName || '?') + '.' +
                String(e.target.className || '').slice(0, 30) +
                ' detail=' + e.detail)
            }, true))
          const el = document.elementFromPoint(${pos.x}, ${pos.y})
          window.__hit = el ? el.tagName + '.' + String(el.className || '').slice(0, 40) : null
        })()`,
        true
      )
      await doubleClickAt(wc, pos.x, pos.y)
      rows.push({
        label: 'hit + events',
        data: await wc.executeJavaScript(
          `({ hit: window.__hit, events: window.__spy })`,
          true
        )
      })

      const inputInfo = await wc.executeJavaScript(
        `(() => {
          const el = document.activeElement
          return {
            tag: el ? el.tagName : null,
            value: el && el.tagName === 'INPUT' ? el.value : null,
            selected:
              el && el.tagName === 'INPUT'
                ? el.selectionEnd - el.selectionStart
                : null
          }
        })()`,
        true
      )
      rows.push({ label: 'after dblclick', data: inputInfo })
      rows.push({
        label: 'focus log',
        data: await wc.executeJavaScript('window.__focusLog', true)
      })

      rows.push({
        label: 'trace + input present',
        data: await wc.executeJavaScript(
          `({ trace: window.__tbRenameTrace,
              input: !!document.querySelector('.SideNav input'),
              active: document.activeElement
                ? document.activeElement.tagName + '.' +
                  String(document.activeElement.className || '').slice(0, 40)
                : null })`,
          true
        )
      })
      if (inputInfo.tag !== 'INPUT') {
        return finish(1, {
          error: 'dblclick did not open the inline input',
          verdict: 'NG'
        })
      }

      // 全選択済みなので、そのままタイプすれば置き換わる
      await typeText(wc, 'Renamed')
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      await sleep(900)

      const sidebar = await wc.executeJavaScript(
        `(() => Array.from(document.querySelectorAll('.SideNav button[class*="folderList-item"]'))
           .map(el => el.getAttribute('title')))()`,
        true
      )
      rows.push({ label: 'sidebar titles', data: sidebar })

      // ディスク側: 子孫パスまで付け替わっているか
      const onDisk = CSON.readFileSync(path.join(storageDir, 'boostnote.json'))
      rows.push({ label: 'boostnote.json', data: onDisk.folders })

      const parent = onDisk.folders.find(f => f.key === 'parent1')
      const child = onDisk.folders.find(f => f.key === 'child1')
      const inputGone = await wc.executeJavaScript(
        `(() => document.activeElement ? document.activeElement.tagName : null)()`,
        true
      )
      rows.push({ label: 'active after Enter', data: inputGone })

      const enterOk =
        parent &&
        parent.name === 'Renamed' &&
        child &&
        child.name === 'Renamed/child' &&
        sidebar.some(t => t === 'Renamed') &&
        sidebar.some(t => t === 'Renamed/child')

      // --- シナリオ2: 外側クリック（blur）で確定するか ---
      // Enter 確定はシナリオ1で証明済み。blur 経路は React の合成イベント頼み
      // なので、実クリックで別途証明する（ユニットテストの onBlur() 直呼びは
      // 配線の証明にしかならない）
      const pos2 = await wc.executeJavaScript(centerOf(rowSel), true)
      await doubleClickAt(wc, pos2.x, pos2.y)
      const editing2 = await wc.executeJavaScript(
        `(() => document.activeElement && document.activeElement.tagName === 'INPUT')()`,
        true
      )
      rows.push({ label: 'scenario2 editing', data: editing2 })
      await typeText(wc, 'Blurred')
      // ノート一覧側をクリックしてフォーカスを外す
      const listPos = await wc.executeJavaScript(
        centerOf('[data-note-list]'),
        true
      )
      wc.sendInputEvent({
        type: 'mouseDown',
        x: listPos.x,
        y: listPos.y,
        button: 'left',
        clickCount: 1
      })
      wc.sendInputEvent({
        type: 'mouseUp',
        x: listPos.x,
        y: listPos.y,
        button: 'left',
        clickCount: 1
      })
      await sleep(900)
      const disk2 = CSON.readFileSync(path.join(storageDir, 'boostnote.json'))
      rows.push({ label: 'after outside click', data: disk2.folders })
      const parent2 = disk2.folders.find(f => f.key === 'parent1')
      const blurOk = editing2 && parent2 && parent2.name === 'Blurred'

      // --- シナリオ3: 空入力は取り消し（ネストで親パスに化けない） ---
      // 全選択のまま Backspace で空にして Enter。'Blurred' のままなら OK
      const pos3 = await wc.executeJavaScript(centerOf(rowSel), true)
      await doubleClickAt(wc, pos3.x, pos3.y)
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' })
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' })
      await sleep(200)
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      await sleep(900)
      const disk3 = CSON.readFileSync(path.join(storageDir, 'boostnote.json'))
      const parent3 = disk3.folders.find(f => f.key === 'parent1')
      const emptyOk = parent3 && parent3.name === 'Blurred'
      rows.push({
        label: 'after empty commit',
        data: { name: parent3 && parent3.name }
      })

      finish(enterOk && blurOk && emptyOk ? 0 : 1, {
        verdict:
          `Enter確定 ${enterOk ? 'OK' : 'NG'} / ` +
          `外側クリック確定 ${blurOk ? 'OK' : 'NG'} / ` +
          `空入力は取り消し ${emptyOk ? 'OK' : 'NG'}` +
          (enterOk && blurOk && emptyOk ? '（子孫カスケード込み）' : '')
      })
    } catch (err) {
      finish(4, { error: String((err && err.message) || err) })
    }
  })
})

app.on('window-all-closed', () => finish(finished ? 0 : 5, {}))

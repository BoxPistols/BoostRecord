// 検索欄のフォーカスが「永久に空振りする」不具合の回帰検証。
//
// TopBar.componentDidMount は URL に searchword があると、フォーカスを当てずに
// isSearching: true をセットする。handleOnSearchFocus はそのフラグを見て
// blur() を呼ぶが、非フォーカス要素への blur() は blur イベントを発火しないので
// isSearching が true のまま張り付き、以後の Focus Search / Ctrl+L /
// 一覧の L キーが二度と効かない。
//
// 起動時に最終閲覧ページを復元するようにしたため、/searched で終了すると
// 次回起動から常にこの状態になる。**起動直後の1回目から効くこと**を測る。
//
// Exit: 0 pass / 1 fail / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-searchfocus-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-searchfocus-'))
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

const checks = []
const notes = []
function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail })
}
function note(name, detail) {
  notes.push({ name, detail })
}

let finished = false
let ran = false
function finish(code, result) {
  if (finished) return
  finished = true
  console.log('\n=== search focus probe ===')
  checks.forEach(c => {
    console.log(
      `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${
        c.detail === undefined ? '' : `  — ${JSON.stringify(c.detail)}`
      }`
    )
  })
  notes.forEach(n =>
    console.log(`INFO  ${n.name} — ${JSON.stringify(n.detail)}`)
  )
  const passed = checks.filter(c => c.pass).length
  console.log(`--- ${passed}/${checks.length} passed, exit ${code}`)
  if (result && result.error) console.log(`ERROR: ${result.error}`)
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, checks, notes, result }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 90000)

// **/searched で終了した状態を再現する。** lastRoute で復元されるので、
// 起動直後から isSearching が立った状態になる
function seed() {
  return `(() => {
    if (localStorage.getItem('__searchFocusSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('lastRoute', '/searched/hello')
    localStorage.setItem('__searchFocusSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

const FOCUS_STATE = `(() => {
  const active = document.activeElement
  const input = document.querySelector('.TopBar input')
  return {
    route: location.hash,
    hasInput: !!input,
    focused: !!(input && input === active),
    activeTag: active ? active.tagName : null
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

        await wc.executeJavaScript(
          `(async () => { const s = ms => new Promise(r => setTimeout(r, ms))
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.TopBar')) break; await s(250) }
             return true })()`,
          true
        )

        // 不具合は **mount 時に URL へ searchword があること** で起きる。
        // lastRoute 経由だと検索結果が無い時に別ルートへ流れてしまうので、
        // /searched へ移動してから reload し、その状態で mount させる
        await wc.executeJavaScript(
          `(async () => { location.hash = '#/searched/hello'
             await new Promise(r => setTimeout(r, 500)); return true })()`,
          true
        )
        wc.reload()
        await new Promise(resolve => setTimeout(resolve, 3500))
        await wc.executeJavaScript(
          `(async () => { const s = ms => new Promise(r => setTimeout(r, ms))
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.TopBar')) break; await s(250) }
             return true })()`,
          true
        )
        win.focus()
        wc.focus()

        const before = await wc.executeJavaScript(FOCUS_STATE, true)
        note('起動直後', before)
        check(
          '/searched で復元されている（不具合の再現条件）',
          before.route.indexOf('/searched') !== -1,
          before
        )
        check('検索欄が存在する', before.hasInput, before)
        check('起動直後はフォーカスされていない', !before.focused, before)

        // Focus Search を撃つ。**1回目から効かなければならない**
        await wc.executeJavaScript(
          `require('browser/main/lib/eventEmitter')` // 参照だけ（存在確認）
            .replace(/^.*$/, '(() => true)()'),
          true
        )
        const fire = `(async () => {
          const s = ms => new Promise(r => setTimeout(r, ms))
          const { ipcRenderer } = require('electron')
          ipcRenderer.emit('top:focus-search')
          await s(400)
          return true
        })()`
        // eventEmitter 経由が本来の経路。ipcRenderer.on で受けているので
        // webContents.send で撃つ
        wc.send('top:focus-search')
        await new Promise(resolve => setTimeout(resolve, 600))
        const first = await wc.executeJavaScript(FOCUS_STATE, true)
        note('Focus Search 1回目', first)
        check(
          '**1回目の Focus Search で検索欄にフォーカスが入る**',
          first.focused,
          first
        )

        // 2回目はトグルで外れる
        wc.send('top:focus-search')
        await new Promise(resolve => setTimeout(resolve, 600))
        const second = await wc.executeJavaScript(FOCUS_STATE, true)
        note('Focus Search 2回目', second)
        check('2回目で外れる（トグルとして機能する）', !second.focused, second)

        // 3回目でまた入る（張り付いていない）
        wc.send('top:focus-search')
        await new Promise(resolve => setTimeout(resolve, 600))
        const third = await wc.executeJavaScript(FOCUS_STATE, true)
        note('Focus Search 3回目', third)
        check('3回目でまた入る（状態が張り付かない）', third.focused, third)

        void fire
        finish(checks.every(c => c.pass) ? 0 : 1, {})
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

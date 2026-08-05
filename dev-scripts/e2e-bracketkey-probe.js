// 「スニペットのタブ移動が Cmd+Shift+] は効くのに Cmd+Shift+[ は効かない」の
// 原因切り分け。ノートを用意せずに済むよう、キーが**どこへ吸われるか**だけを見る。
//
// 疑い: View メニューの Previous Note が CommandOrControl+[、Next Note が
// CommandOrControl+] に割り当たっている。macOS のネイティブアクセラレータが
// Shift 付きでも一致すると、キーはメニューに食われて renderer の
// keydown まで届かない（届かなければ SnippetNoteDetail の判定は無関係）。
//
// 測ること:
//   1. Cmd+Shift+[ / ] で renderer に keydown が届くか（code / keyCode 付き）
//   2. 同じキーでメニュー経由の list:prior / list:next が飛ぶか
// 修飾なしの Cmd+[ / Cmd+] も対照として測る。
//
// Exit: 0 判定できた / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-bracket-result.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-bracket-'))
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
  console.log('\n=== bracket key probe ===')
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
setTimeout(() => finish(3, { error: 'watchdog' }), 90000)

function seed() {
  return `(() => {
    if (localStorage.getItem('__bracketProbeSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__bracketProbeSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

// renderer 側に観測点を仕込む。keydown は capture で拾う（途中で
// stopPropagation されても「届いたか」だけは分かる）
function installSpies() {
  return `(() => {
    const { ipcRenderer } = require('electron')
    window.__bracket = { keys: [], ipc: [] }
    window.addEventListener('keydown', e => {
      window.__bracket.keys.push({
        code: e.code, keyCode: e.keyCode, key: e.key,
        meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey
      })
    }, true)
    ;['list:next', 'list:prior'].forEach(ch => {
      ipcRenderer.on(ch, () => window.__bracket.ipc.push(ch))
    })
    return true
  })()`
}

function readAndReset() {
  return `(() => {
    const out = window.__bracket
    window.__bracket = { keys: [], ipc: [] }
    return out
  })()`
}

function press(wc, keyCode, modifiers) {
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  return new Promise(resolve => setTimeout(resolve, 450))
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
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover')) break; await s(250) }
             return true })()`,
          true
        )
        await wc.executeJavaScript(installSpies(), true)

        const isMac = process.platform === 'darwin'
        const SUPER = isMac ? 'cmd' : 'control'
        const cases = [
          { label: 'Super+[', keyCode: '[', modifiers: [SUPER] },
          { label: 'Super+]', keyCode: ']', modifiers: [SUPER] },
          { label: 'Super+Shift+[', keyCode: '[', modifiers: [SUPER, 'shift'] },
          { label: 'Super+Shift+]', keyCode: ']', modifiers: [SUPER, 'shift'] }
        ]
        for (const c of cases) {
          await press(wc, c.keyCode, c.modifiers)
          const seen = await wc.executeJavaScript(readAndReset(), true)
          rows.push({
            label: c.label,
            data: {
              keydownReachedRenderer: seen.keys.length > 0,
              keys: seen.keys,
              menuIpc: seen.ipc
            }
          })
        }

        const byLabel = l => rows.find(r => r.label === l).data
        const sl = byLabel('Super+Shift+[')
        const sr = byLabel('Super+Shift+]')
        let verdict
        if (!sl.keydownReachedRenderer && sr.keydownReachedRenderer) {
          verdict =
            'Cmd+Shift+[ だけ renderer に届いていない = ネイティブ側（メニュー等）が奪っている'
        } else if (sl.menuIpc.length && !sr.menuIpc.length) {
          verdict =
            'Cmd+Shift+[ がメニューの Previous Note を発火させている（list:prior）'
        } else if (sl.keydownReachedRenderer && sr.keydownReachedRenderer) {
          verdict =
            '両方 renderer に届いている = 原因はキー到達ではなく renderer 側の判定/状態'
        } else {
          verdict = '想定外の組み合わせ。rows を確認'
        }
        finish(0, { verdict })
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

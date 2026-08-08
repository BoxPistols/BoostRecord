// 「チェックリスト進捗バー (TodoListPercentage) がノート本文の1行目に
// 被らないか」を実機レイアウトで測る probe。
//
// 背景: バーは position:absolute / top:72px / height:17px で .body(上端 69px)
// に 20px 食い込む。目次だけ下げる実装だったため、エディタ1行目と
// プレビュー先頭がバーの下に隠れていた（実機スクショで確認）。
// 修正後は「バーがある時は .body 全体を食い込み分だけ下げる」。
//
// 測ること:
//   1. チェックボックス入りノート: バーの下端 <= エディタ(.CodeMirror)の上端
//   2. 同: 目次ペインの上端もバーの下端以深
//   3. チェックボックス無しノート: バーが無く、本文が下がりすぎていない
//
// Exit: 0 PASS / 1 FAIL / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-todobar-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-todobar-'))
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
  console.log('\n=== todo bar layout probe ===')
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
    if (localStorage.getItem('__todoBarSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__todoBarSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

// マークダウンノートを1件作って本文を流し込む（findkey probe と同じ手順）
function makeNote(content) {
  return `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
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
     cm.CodeMirror.setValue(${JSON.stringify(content)})
     await sleep(1200)
     return { ok:true }
   })()`
}

const MEASURE = `(() => {
  const bar = document.querySelector('[class*="percentageBar"]')
  const cm = document.querySelector('.CodeMirror')
  const toc = document.querySelector('[class*="body-toc"]')
  const rect = el => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      // TODO 無しの時バーは DOM に残ったまま display:none になる
      // (rect が全て 0)。存在ではなく可視で判定する
      visible: r.width > 0 && r.height > 0
    }
  }
  return { bar: rect(bar), cm: rect(cm), toc: rect(toc) }
})()`

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

        // --- 1. チェックボックス入りノート ---
        const made = await wc.executeJavaScript(
          makeNote('# todo note\n\n- [ ] one\n- [ ] two\n\nfirst line body\n'),
          true
        )
        rows.push({ label: 'todo ノート作成', data: made })
        if (!made.ok) return finish(2, { error: 'setup: ' + made.step })

        const withBar = await wc.executeJavaScript(MEASURE, true)
        rows.push({ label: 'バーあり時の実測', data: withBar })

        // --- 2. チェックボックス無しノート ---
        const made2 = await wc.executeJavaScript(
          makeNote('# plain note\n\nno checkbox here\n'),
          true
        )
        rows.push({ label: 'plain ノート作成', data: made2 })
        const noBar = made2.ok
          ? await wc.executeJavaScript(MEASURE, true)
          : null
        rows.push({ label: 'バー無し時の実測', data: noBar })

        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          const img = await win.webContents.capturePage()
          const shot = path.join(
            process.env.TB_SHOT_DIR || os.tmpdir(),
            'todobar-layout.png'
          )
          fs.writeFileSync(shot, img.toPNG())
          rows.push({ label: 'SHOT', data: shot })
        }

        // 判定。「測れていないのに緑」を避ける: 要素が取れなければ FAIL
        const problems = []
        if (!withBar.bar || !withBar.bar.visible) {
          problems.push('バーが描画されていない')
        }
        if (!withBar.cm) problems.push('エディタが取れない')
        if (withBar.bar && withBar.cm && withBar.cm.top < withBar.bar.bottom) {
          problems.push(
            `エディタ上端 ${withBar.cm.top} がバー下端 ${withBar.bar.bottom} より上（被っている）`
          )
        }
        if (
          withBar.bar &&
          withBar.toc &&
          withBar.toc.top < withBar.bar.bottom
        ) {
          problems.push(
            `目次上端 ${withBar.toc.top} がバー下端 ${withBar.bar.bottom} より上（被っている）`
          )
        }
        if (noBar) {
          if (noBar.bar && noBar.bar.visible) {
            problems.push('チェック無しノートでバーが出ている')
          }
          // .body の定位置は top 69。下がりっぱなし(=89)なら inline style の
          // 戻し忘れ
          if (noBar.cm && noBar.cm.top > 80) {
            problems.push(
              `バー無しなのにエディタ上端が ${noBar.cm.top}（下がったまま）`
            )
          }
        } else {
          problems.push('バー無しノートを測れていない')
        }

        const verdict =
          problems.length === 0
            ? 'PASS: バーは本文・目次に被らない / バー無し時は定位置'
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

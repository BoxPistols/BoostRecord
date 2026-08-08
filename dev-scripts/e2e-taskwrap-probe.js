// タスクリストのチェックボックス直後に長い URL / inline code が来た時、
// 内容がチェックボックスと同じ行から始まる（チェックボックスだけが1行目に
// 取り残されない）ことをプレビュー iframe の実レイアウトで測る probe。
//
// 背景: p の word-wrap:break-word は「語が1行に収まらない時だけ」行内で折り、
// 収まる長さの語は丸ごと次行へ送る。チェックボックス後の残り幅に収まらず
// 1行には収まる長さの URL / code がちょうどこの穴に落ちる。修正は
// li.taskListItem 配下の a / code への word-break:break-all。
//
// 判定対象は「チェックボックス直後（空白のみ挟む）に a/code が来る項目」のみ。
// 手前に文がある項目の折返しは正当なので skip する。
//
// Exit: 0 PASS / 1 FAIL / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-taskwrap-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-taskwrap-'))
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
  console.log('\n=== task wrap probe ===')
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
    if (localStorage.getItem('__taskWrapSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__taskWrapSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

// 先頭2項目がアサート対象（URL 直後 / code 直後）。後半2つは skip 確認用
const CONTENT = [
  '# wrap test',
  '',
  '- [ ] https://github.com/settings/applications/new を開く',
  '- [ ] `https://github-reporadar.vercel.app/api/auth/callback` を設定',
  '- [ ] **Application name**: `GitHub RepoRadar`(任意)',
  '- [ ] **Homepage URL**: `https://github-reporadar.vercel.app`',
  ''
].join('\n')

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

        // 症状は狭いペインで出やすい。窓を狭めて残り幅の穴を踏みやすくする
        const w0 = BrowserWindow.getAllWindows()[0]
        if (w0) w0.setSize(1000, 760)

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
             cm.CodeMirror.setValue(${JSON.stringify(CONTENT)})
             await sleep(1500)
             return { ok:true }
           })()`,
          true
        )
        rows.push({ label: 'note created', data: made })
        if (!made.ok) return finish(2, { error: 'setup: ' + made.step })

        const measured = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             let doc = null
             for (let i=0;i<20;i++){
               const f = document.querySelector('iframe.MarkdownPreview, .MarkdownPreview')
               doc = f && f.contentWindow && f.contentWindow.document
               if (doc && doc.querySelectorAll('input[type=checkbox]').length >= 4) break
               doc = null; await sleep(300)
             }
             if (!doc) return { ok:false, step:'no preview with checkboxes' }
             const items = Array.from(doc.querySelectorAll('input[type=checkbox]')).map(cb => {
               const li = cb.closest('li') || cb.parentElement
               const target = li.querySelector('a') || li.querySelector('code')
               if (!target) return { kind: 'none' }
               // チェックボックス直後(空白のみ挟む)に来る a/code だけが対象
               let n = cb.nextSibling
               while (n && n.nodeType === 3 && !n.textContent.trim()) n = n.nextSibling
               if (n !== target) return { kind: 'skip' }
               const cbRect = cb.getBoundingClientRect()
               const first = target.getClientRects()[0]
               return {
                 kind: target.tagName,
                 wordBreak: doc.defaultView.getComputedStyle(target).wordBreak,
                 cbBottom: Math.round(cbRect.bottom),
                 contentTop: first ? Math.round(first.top) : null,
                 rectCount: target.getClientRects().length,
                 paneW: Math.round(doc.body.clientWidth)
               }
             })
             return { ok:true, items }
           })()`,
          true
        )
        rows.push({ label: 'preview 実測', data: measured })
        if (!measured.ok) return finish(2, { error: measured.step })

        const problems = []
        let asserted = 0
        measured.items.forEach((it, i) => {
          if (it.kind === 'none' || it.kind === 'skip') return
          asserted++
          // 同じ行から始まる = 内容先頭の rect がチェックボックスの縦帯内
          if (it.contentTop == null || it.contentTop >= it.cbBottom) {
            problems.push(
              `item${i}(${it.kind}): 内容上端 ${it.contentTop} がチェックボックス下端 ${it.cbBottom} より下（次行へ落ちている）`
            )
          }
        })
        // 「測れていないのに緑」を防ぐ: アサート対象2件が揃わなければ落とす
        if (asserted < 2) {
          problems.push('アサート対象が2件ない: ' + asserted)
        }

        const verdict =
          problems.length === 0
            ? 'PASS: URL / inline code はチェックボックスと同じ行から始まる'
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

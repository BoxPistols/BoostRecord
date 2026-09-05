// 「AIで文章を改善する」窓の差分 UI を実機で動かす probe。
// API キーが無い環境でも見られるよう、renderer 側で ipc 'ai:run' を差し替えて
// 決まった返答（変更点 + ```revised 全文）を返す。
// 見るもの: 差分の塊が出る / 塊を外せる / 選んだ塊だけ適用される / 元に戻せる
// Exit: 0 pass / 1 fail / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const SHOT_DIR = process.env.TB_SHOT_DIR || os.tmpdir()
const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-aichat-result.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-aichat-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'nfolder', name: 'Notes', color: '#E10051' }],
    version: '1.0'
  })
)
const ORIGINAL = [
  '# 持ち物',
  '',
  '## 基本',
  '',
  '- [ ] 半袖 4〜5枚',
  '- [ ] 長袖 2〜3枚',
  '',
  '高山で洗濯できるなら、さらに減らせます。',
  '',
  '## 雨対策',
  '',
  '- [ ] 折りたたみ傘 ×2',
  '- [ ] 遮光傘 ×1',
  '',
  'これはかなり重要です。'
].join('\n')
fs.writeFileSync(
  path.join(storageDir, 'notes', 'a0.cson'),
  [
    'createdAt: "2026-01-01T00:00:00.000Z"',
    'updatedAt: "2026-01-01T00:00:00.000Z"',
    'type: "MARKDOWN_NOTE"',
    'folder: "nfolder"',
    'title: "AI Diff Note"',
    'tags: []',
    'isStarred: false',
    'isTrashed: false',
    `content: ${JSON.stringify(ORIGINAL)}`,
    ''
  ].join('\n')
)
app.setPath('userData', path.join(tmpRoot, 'userData'))
app.setPath('home', tmpRoot)

const checks = []
const shots = []
function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail })
}
let finished = false
let ran = false
function finish(code, result) {
  if (finished) return
  finished = true
  console.log('\n=== ai-chat probe ===')
  checks.forEach(c =>
    console.log(
      `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${
        c.detail === undefined ? '' : `  — ${JSON.stringify(c.detail)}`
      }`
    )
  )
  shots.forEach(s => console.log(`SHOT  ${s}`))
  console.log(
    `--- ${checks.filter(c => c.pass).length}/${
      checks.length
    } passed, exit ${code}`
  )
  if (result && result.error) console.log(`ERROR: ${result.error}`)
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ code, checks, shots, result }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 120000)

function seed() {
  return `(() => {
    if (localStorage.getItem('__aichatSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('config', JSON.stringify({
      zoom:1, isSideNavFolded:false, listWidth:280,
      ui:{ language:'ja', theme:'dark' },
      ai:{ provider:'openai', openai:{ apiKey:'dummy', model:'gpt-5.6-luna' } }
    }))
    localStorage.setItem('__aichatSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

// 偽の AI 応答。2 箇所を変える: 「長袖 2〜3枚」→「薄手長袖 2〜3枚」、
// 「これはかなり重要です。」を削る。傘は触らない
const REPLY = [
  '- 「長袖」を「薄手長袖」に具体化',
  '- 根拠の無い評価文「これはかなり重要です。」を削除',
  '',
  '```revised',
  ORIGINAL.replace('長袖 2〜3枚', '薄手長袖 2〜3枚').replace(
    '\n\nこれはかなり重要です。',
    ''
  ),
  '```'
].join('\n')

const helpers = `
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const buttons = () => Array.from(document.querySelectorAll('button'))
  const byText = t => buttons().find(b => (b.textContent || '').trim() === t)
  const byLabel = re => buttons().find(b => re.test(b.getAttribute('aria-label') || ''))
`

function driver() {
  return `(async () => {${helpers}
    for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
    // ai:run を差し替える（本物の API には出ない）
    const { ipcRenderer } = require('electron')
    const orig = ipcRenderer.invoke.bind(ipcRenderer)
    const REPLY = ${JSON.stringify(REPLY)}
    ipcRenderer.invoke = (ch, arg) => ch === 'ai:run' ? Promise.resolve(REPLY) : orig(ch, arg)

    const all = Array.from(document.querySelectorAll('button,div,span')).find(el => (el.textContent||'').trim() === 'すべてのノート')
    if (all) { all.click(); await sleep(400) }
    for (let i=0;i<40;i++){
      const hit = Array.from(document.querySelectorAll('div,span,li,a')).find(el => (el.textContent||'').trim() === 'AI Diff Note')
      if (hit) { let n = hit; for (let d=0; d<4 && n; d++){ n.click(); n = n.parentElement } break }
      await sleep(250)
    }
    for (let i=0;i<40;i++){ if (document.querySelector('.CodeMirror')) break; await sleep(250) }
    // 窓を開く
    require('@electron/remote').getCurrentWindow().webContents.send('detail:aichat')
    let quick = null
    for (let i=0;i<40;i++){ await sleep(250); quick = byText('改善案を出す'); if (quick) break }
    if (!quick) return { ok:false, step:'modal did not open' }
    quick.click()
    // 差分の塊（チェックボックス）が出るまで待つ
    let hunks = []
    for (let i=0;i<40;i++){ await sleep(250); hunks = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(c => /この変更を採用|ここは元のまま/.test((c.parentElement.textContent||''))); if (hunks.length >= 2) break }
    const changesTab = buttons().find(b => /^変更\\s*\\d+$/.test((b.textContent||'').replace(/\\s+/g,' ').trim()))
    const before = { hunks: hunks.length, changesTab: changesTab ? changesTab.textContent.trim() : '' }
    // 2 つ目の塊（評価文の削除）を外す
    hunks[1].click(); await sleep(200)
    const applyBtn = byText('選んだ変更だけ適用')
    const shot1 = !!applyBtn
    window.__aichatShot = 'diff'
    return { ok:true, before, applyLabel: applyBtn ? applyBtn.textContent.trim() : (byText('ノート全体を置き換える') ? 'ノート全体を置き換える' : '') }
  })()`
}

function applyAndUndo() {
  return `(async () => {${helpers}
    const cm = document.querySelector('.CodeMirror').CodeMirror
    const applyBtn = byText('選んだ変更だけ適用') || byText('ノート全体を置き換える')
    applyBtn.click(); await sleep(400)
    const afterApply = cm.getValue()
    const undo = byText('元に戻す')
    const undoEnabled = undo && !undo.disabled
    undo.click(); await sleep(300)
    const afterUndo = cm.getValue()
    const redo = byText('やり直す'); redo.click(); await sleep(300)
    const afterRedo = cm.getValue()
    return { afterApply, afterUndo, afterRedo, undoEnabled }
  })()`
}

async function shoot(win, name) {
  const img = await win.webContents.capturePage()
  const file = path.join(SHOT_DIR, name)
  fs.writeFileSync(file, img.toPNG())
  shots.push(file)
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true
        const win = BrowserWindow.getAllWindows()[0]
        const r = await wc.executeJavaScript(driver(), true)
        if (!r.ok) return finish(1, r)
        check('返答が差分の塊 2 つになる', r.before.hunks === 2, r.before)
        check(
          '「変更 2」タブが出る',
          r.before.changesTab === '変更 2',
          r.before
        )
        check(
          '塊を 1 つ外すとボタンが「選んだ変更だけ適用」になる',
          r.applyLabel === '選んだ変更だけ適用',
          r
        )
        await shoot(win, 'aichat-diff.png')
        const a = await wc.executeJavaScript(applyAndUndo(), true)
        const expected = ORIGINAL.replace('長袖 2〜3枚', '薄手長袖 2〜3枚')
        check(
          '採用した塊だけ本文に入り、外した塊（削除）は元のまま',
          a.afterApply === expected,
          {
            got: a.afterApply.split('\n').slice(4, 6),
            keptLast: /これはかなり重要です。$/.test(a.afterApply)
          }
        )
        check('元に戻すで適用前に戻る', a.afterUndo === ORIGINAL, {
          undoEnabled: a.undoEnabled
        })
        check('やり直すで再び適用後になる', a.afterRedo === expected)
        await shoot(win, 'aichat-applied.png')
        finish(checks.every(c => c.pass) ? 0 : 1, {})
      } catch (err) {
        finish(2, { error: 'exec failed: ' + err.message })
      }
    }, 4000)
  })
})

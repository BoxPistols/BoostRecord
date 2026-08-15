// 設定 → AI 画面を実際に開いて、DOM を測りつつスクリーンショットを撮る probe。
//
// ビルドが通ることと画面が意図どおり出ることは別。モデル一覧の更新も
// 「使用中」バッジも、ここまで来ないと本当に出ているか分からない。
//
// 撮影は capturePage。window は show:false のまま（前面に出すとユーザーの
// 作業からフォーカスを奪う）。PNG は TB_SHOT_DIR に出す。
//
// Exit: 0 pass / 1 fail / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const SHOT_DIR = process.env.TB_SHOT_DIR || os.tmpdir()
const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-aitab-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-aitab-'))
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
const shots = []
function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail })
}

let finished = false
let ran = false
function finish(code, result) {
  if (finished) return
  finished = true
  console.log('\n=== ai-tab probe ===')
  checks.forEach(c => {
    console.log(
      `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${
        c.detail === undefined ? '' : `  — ${JSON.stringify(c.detail)}`
      }`
    )
  })
  const passed = checks.filter(c => c.pass).length
  shots.forEach(s => console.log(`SHOT  ${s}`))
  console.log(`--- ${passed}/${checks.length} passed, exit ${code}`)
  if (result && result.error) console.log(`ERROR: ${result.error}`)
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, checks, shots, result }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 120000)

// storages はアプリが起動中に自前生成するので、seed 済み判定には使えない
function seed() {
  return `(() => {
    if (localStorage.getItem('__aitabProbeSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]))
    // 旧モデル ID を積んでおく。起動時の移行で既定へ寄るのが正しい
    localStorage.setItem('config', JSON.stringify({
      zoom:1, isSideNavFolded:false, listWidth:280,
      ui:{ language:'ja', theme:'dark' },
      ai:{ provider:'openai',
           openai:{ apiKey:'', model:'gpt-5-mini' },
           gemini:{ apiKey:'', model:'gemini-2.5-flash' } }
    }))
    localStorage.setItem('__aitabProbeSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

const helpers = `
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const buttons = () => Array.from(document.querySelectorAll('button'))
  const byText = t => buttons().find(b => (b.textContent || '').trim() === t)
`

function waitReady() {
  return `(async () => {${helpers}
    for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
    return !!document.querySelector('.SideNav')
  })()`
}

// 設定ボタンは CSS Modules でクラス名がハッシュ化されるので、
// アイコンの src で見分ける
function openAiTab() {
  return `(async () => {${helpers}
    const pref = buttons().find(b => (b.innerHTML || '').indexOf('icon-setting') !== -1)
    if (!pref) return { ok: false, step: 'preference button not found' }
    pref.click()
    for (let i=0;i<40;i++){ if (byText('AI')) break; await sleep(150) }
    const aiTab = byText('AI')
    if (!aiTab) return { ok: false, step: 'AI tab not found' }
    aiTab.click()
    for (let i=0;i<40;i++){ if (document.querySelector('select')) break; await sleep(150) }
    return { ok: !!document.querySelector('select') }
  })()`
}

// 画面から読み取れる事実だけを返す
function readAiTab() {
  return `(() => {${helpers}
    const text = document.body.innerText || ''
    // モーダルの背後にもセレクトがある（ノート一覧の並び替え等）。
    // 素の querySelectorAll('select')[0] はそれを拾う。中身で絞る
    const selects = Array.from(document.querySelectorAll('select')).filter(s =>
      Array.from(s.options).some(o => /gpt-|gemini-/.test(o.text)))
    const selected = selects.map(s => (s.options[s.selectedIndex] || {}).text || '')
    const options = selects.map(s => Array.from(s.options).map(o => o.text))
    // どのプロバイダを使うかは**カード上のラジオ**で選ぶ。
    // 以前は上部のセグメンテッドコントロールで、押しても下が切り替わらず
    // 「意味の無いタブ」に見えていた（利用者からの指摘）
    const radios = Array.from(
      document.querySelectorAll('input[name="ai-provider"]')
    )
    const owners = radios.map(r => {
      const card = r.closest('div').parentNode
      const head = card.querySelector('span')
      return ((head && head.textContent) || '').trim()
    })
    const checkedIndex = radios.findIndex(r => r.checked)
    return {
      hasByokNotice: text.indexOf('API キーは同梱していません') !== -1,
      selected,
      options,
      radioCount: radios.length,
      checkedCount: radios.filter(r => r.checked).length,
      owners,
      checkedOwner: checkedIndex >= 0 ? owners[checkedIndex] : null,
      // 旧 UI が残っていないこと（消し忘れると選択肢が2か所になる）
      legacyBadges: Array.from(document.querySelectorAll('span')).filter(
        s => (s.textContent || '').trim() === '使用中'
      ).length
    }
  })()`
}

function clickProvider(label) {
  return `(async () => {${helpers}
    const radios = Array.from(
      document.querySelectorAll('input[name="ai-provider"]')
    )
    const target = radios.find(r => {
      const card = r.closest('div').parentNode
      const head = card.querySelector('span')
      return ((head && head.textContent) || '').trim() === ${JSON.stringify(
        label
      )}
    })
    if (!target) return false
    target.click(); await sleep(400); return true
  })()`
}

async function shoot(win, name) {
  const img = await win.webContents.capturePage()
  const file = path.join(SHOT_DIR, name)
  fs.writeFileSync(file, img.toPNG())
  shots.push(file)
  return file
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true

        const ready = await wc.executeJavaScript(waitReady(), true)
        if (!ready) return finish(2, { error: 'SideNav never mounted' })

        const opened = await wc.executeJavaScript(openAiTab(), true)
        check('設定 → AI タブを開ける', opened && opened.ok, opened)
        if (!opened || !opened.ok) return finish(1, {})

        const win = BrowserWindow.getAllWindows()[0]
        const view = await wc.executeJavaScript(readAiTab(), true)

        check('BYOK の注意書きが出ている', view.hasByokNotice)
        check(
          '旧モデル ID が既定へ寄っている',
          view.selected[0] === 'gpt-5.6-luna （既定・無料/回数制限あり）',
          { selected: view.selected[0] }
        )
        check(
          'OpenAI の選択肢が 2026-08 版',
          JSON.stringify(view.options[0]) ===
            JSON.stringify([
              'gpt-5.6-luna （既定・無料/回数制限あり）',
              'gpt-5.6-sol'
            ]),
          { options: view.options[0] }
        )
        check('各プロバイダのカードに選択ラジオがある', view.radioCount === 2, {
          radioCount: view.radioCount,
          owners: view.owners
        })
        check('選択は常にどちらか一方だけ', view.checkedCount === 1, {
          checkedCount: view.checkedCount
        })
        check('既定は OpenAI が選ばれている', view.checkedOwner === 'OpenAI', {
          checkedOwner: view.checkedOwner
        })
        check(
          '旧UI（上部のセグメント／使用中バッジ）が残っていない',
          view.legacyBadges === 0,
          { legacyBadges: view.legacyBadges }
        )
        await shoot(win, 'ai-tab-openai.png')

        // セグメントを押したら表示が変わることの確認（ここが今回の指摘）
        const switched = await wc.executeJavaScript(
          clickProvider('Gemini'),
          true
        )
        check('Gemini のラジオを押せる', switched)
        const after = await wc.executeJavaScript(readAiTab(), true)
        check('押すと選択が Gemini へ移る', after.checkedOwner === 'Gemini', {
          checkedOwner: after.checkedOwner
        })
        check('移した後も選択は一方だけ', after.checkedCount === 1, {
          checkedCount: after.checkedCount
        })
        await shoot(win, 'ai-tab-gemini.png')

        finish(checks.every(c => c.pass) ? 0 : 1, {})
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

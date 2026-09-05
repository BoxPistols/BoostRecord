// 本体の読み上げが、設定画面で保存した値どおりに合成を頼んでいるかを実測する。
// 設定に目立つ値を保存 → ノートを再生 → ipcRenderer.invoke('tts:speak') の引数を
// 捕まえて、保存した値と一致するかを見る。
// Exit: 0 pass / 1 fail / 2 probe error / 3 watchdog
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-ttsparams-result.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-ttsparams-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'nfolder', name: 'Notes', color: '#E10051' }],
    version: '1.0'
  })
)
fs.writeFileSync(
  path.join(storageDir, 'notes', 'p0.cson'),
  [
    'createdAt: "2026-01-01T00:00:00.000Z"',
    'updatedAt: "2026-01-01T00:00:00.000Z"',
    'type: "MARKDOWN_NOTE"',
    'folder: "nfolder"',
    'title: "Params Note"',
    'tags: []',
    'isStarred: false',
    'isTrashed: false',
    'content: "# Params Note\\n\\n最初の段落です。\\n\\n二つ目の段落です。"',
    ''
  ].join('\n')
)
app.setPath('userData', path.join(tmpRoot, 'userData'))
app.setPath('home', tmpRoot)

// 保存する値。既定（1.2 / 0 / 0.6 …）と全部違えておく
const SAVED = {
  speed: 0.8,
  pitch: -0.1,
  intonation: 0.5,
  volume: 0.7,
  pauseScale: 1.3,
  prePause: 0.3,
  postPause: 0.2
}

const checks = []
function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail })
}
let finished = false
let ran = false
function finish(code, result) {
  if (finished) return
  finished = true
  console.log('\n=== tts-params probe ===')
  checks.forEach(c =>
    console.log(
      `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${
        c.detail === undefined ? '' : `  — ${JSON.stringify(c.detail)}`
      }`
    )
  )
  console.log(
    `--- ${checks.filter(c => c.pass).length}/${
      checks.length
    } passed, exit ${code}`
  )
  if (result && result.error) console.log(`ERROR: ${result.error}`)
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ code, checks, result }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 120000)

function seed() {
  return `(() => {
    if (localStorage.getItem('__ttsparamsSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('config', JSON.stringify({
      zoom:1, isSideNavFolded:false, listWidth:280,
      ui:{ language:'ja', theme:'dark' },
      tts: Object.assign({ engine:'voicevox', port:50021, speakerId:126, speakerLabel:'里石ユカ（つぼみ）' }, ${JSON.stringify(
        SAVED
      )})
    }))
    localStorage.setItem('__ttsparamsSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

const helpers = `
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const buttons = () => Array.from(document.querySelectorAll('button'))
  const byLabel = re => buttons().find(b => re.test(b.getAttribute('aria-label') || ''))
`

function driver() {
  return `(async () => {${helpers}
    for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
    // IPC を横取りして、tts:speak の引数を記録する
    const { ipcRenderer } = require('electron')
    const orig = ipcRenderer.invoke.bind(ipcRenderer)
    const calls = []
    ipcRenderer.invoke = (ch, arg) => { if (ch === 'tts:speak') calls.push(JSON.parse(JSON.stringify(arg))); return orig(ch, arg) }

    const all = Array.from(document.querySelectorAll('button,div,span')).find(el => (el.textContent||'').trim() === 'すべてのノート')
    if (all) { all.click(); await sleep(400) }
    for (let i=0;i<40;i++){
      const hit = Array.from(document.querySelectorAll('div,span,li,a')).find(el => (el.textContent||'').trim() === 'Params Note')
      if (hit) { let n = hit; for (let d=0; d<4 && n; d++){ n.click(); n = n.parentElement } break }
      await sleep(250)
    }
    let btn = null
    for (let i=0;i<40;i++){ btn = byLabel(/^読み上げ$/); if (btn) break; await sleep(250) }
    if (!btn) return { ok:false, step:'no read-aloud button' }
    btn.click(); await sleep(300)
    const play = byLabel(/^再生$/); if (!play) return { ok:false, step:'no play' }
    play.click()
    for (let i=0;i<60;i++){ await sleep(250); if (calls.length) break }
    await sleep(500)
    return { ok: true, calls }
  })()`
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true
        const r = await wc.executeJavaScript(driver(), true)
        if (!r.ok) return finish(1, r)
        const first = r.calls[0]
        check('再生で tts:speak が呼ばれる', !!first, { count: r.calls.length })
        if (first) {
          check('話者 ID が保存値', first.speakerId === 126, {
            sent: first.speakerId
          })
          const p = first.params || {}
          const diffs = Object.keys(SAVED)
            .filter(k => k !== 'speed')
            .filter(
              k => Math.abs((p[k] == null ? NaN : p[k]) - SAVED[k]) > 0.001
            )
          check(
            '話速以外の全パラメータが保存値どおり渡っている',
            diffs.length === 0,
            {
              sent: p,
              saved: SAVED,
              diffs
            }
          )
          check(
            '話速はプレーヤーの初期値＝設定の話速',
            Math.abs(p.speed - SAVED.speed) < 0.001,
            {
              sent: p.speed,
              saved: SAVED.speed
            }
          )
          check(
            '倍率方式（speedMultiplier）は渡していない',
            first.speedMultiplier === undefined,
            {
              speedMultiplier: first.speedMultiplier
            }
          )
        }
        finish(checks.every(c => c.pass) ? 0 : 1, {})
      } catch (err) {
        finish(2, { error: 'exec failed: ' + err.message })
      }
    }, 4000)
  })
})

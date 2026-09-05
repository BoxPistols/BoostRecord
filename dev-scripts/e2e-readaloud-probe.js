// 読み上げの実機 probe。
//   1. 設定 → AI: VOICEVOX の話者一覧が選択肢になり、既定が里石ユカ（つぼみ）
//   2. 設定: 修飾キー + 数字で左ナビのタブが切り替わる
//   3. ノート: スピーカーボタンで再生バーが出て、再生で進む（VOICEVOX 実合成）
//
// VOICEVOX が起動していない環境では 1 と 3 の合成系は FAIL になる（仕様）。
// window は show:false のまま。撮影は capturePage。
// Exit: 0 pass / 1 fail / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const http = require('http')

// 起動途中の VOICEVOX を模す偽エンジン。最初は listen せず（接続拒否）、
// 指示があってから /speakers を返し始める。「利用者が何もしなくても一覧が
// 戻るか」はこれでしか検証できない（本物の起動停止を probe から触れない）
const FAKE_PORT = 50098
const fakeSpeakers = [
  {
    name: '里石ユカ',
    speaker_uuid: 'fake-yuka',
    styles: [{ id: 126, name: 'つぼみ', type: 'talk' }]
  },
  {
    name: 'ずんだもん',
    speaker_uuid: 'fake-zunda',
    styles: [{ id: 3, name: 'ノーマル', type: 'talk' }]
  }
]
const fakeEngine = http.createServer((req, res) => {
  if (req.url === '/version') {
    res.setHeader('Content-Type', 'application/json')
    return res.end('"fake"')
  }
  if (req.url === '/speakers') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify(fakeSpeakers))
  }
  res.statusCode = 404
  res.end('{}')
})
function startFakeEngine() {
  return new Promise(resolve =>
    fakeEngine.listen(FAKE_PORT, '127.0.0.1', resolve)
  )
}

const SHOT_DIR = process.env.TB_SHOT_DIR || os.tmpdir()
const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-readaloud-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-readaloud-'))
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
  path.join(storageDir, 'notes', 'readaloud0.cson'),
  [
    'createdAt: "2026-01-01T00:00:00.000Z"',
    'updatedAt: "2026-01-01T00:00:00.000Z"',
    'type: "MARKDOWN_NOTE"',
    'folder: "nfolder"',
    'title: "Read Aloud Note"',
    'tags: []',
    'isStarred: false',
    'isTrashed: false',
    'content: "# Read Aloud Note\\n\\n最初の段落です。短い文です。\\n\\n二つ目の段落です。"',
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
  console.log('\n=== read-aloud probe ===')
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
setTimeout(() => finish(3, { error: 'watchdog' }), 150000)

function seed() {
  return `(() => {
    if (localStorage.getItem('__readaloudProbeSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]))
    // 旧 UI の保存形（speakerLabel 無し・話者 1）。起動時の移行で 126 に寄るのが正しい
    localStorage.setItem('config', JSON.stringify({
      zoom:1, isSideNavFolded:false, listWidth:280,
      ui:{ language:'ja', theme:'dark' },
      tts:{ engine:'voicevox', port:${FAKE_PORT}, speakerId:1 }
    }))
    localStorage.setItem('__readaloudProbeSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

const helpers = `
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const buttons = () => Array.from(document.querySelectorAll('button'))
  const byText = t => buttons().find(b => (b.textContent || '').trim() === t)
  const byLabel = re => buttons().find(b => re.test(b.getAttribute('aria-label') || ''))
`

function waitReady() {
  return `(async () => {${helpers}
    for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
    return !!document.querySelector('.SideNav')
  })()`
}

function openAiTab() {
  return `(async () => {${helpers}
    const pref = buttons().find(b => (b.innerHTML || '').indexOf('icon-setting') !== -1)
    if (!pref) return { ok: false, step: 'preference button not found' }
    pref.click()
    for (let i=0;i<40;i++){ if (byText('AI')) break; await sleep(150) }
    const aiTab = byText('AI')
    if (!aiTab) return { ok: false, step: 'AI tab not found' }
    aiTab.click()
    // 接続中の表示が消える（= 1 回目の取得が失敗した）まで待つ
    for (let i=0;i<60;i++){ await sleep(200); const t = document.body.innerText || ''; if (t.indexOf('読み上げ') !== -1 && !/接続中/.test(t)) break }
    return { ok: true }
  })()`
}

function readAiTab() {
  return `(() => {${helpers}
    const selects = Array.from(document.querySelectorAll('select'))
    const charSel = selects.find(s => Array.from(s.options).some(o => /里石ユカ|ずんだもん/.test(o.text)))
    const styleSel = charSel ? selects[selects.indexOf(charSel) + 1] : null
    const ranges = Array.from(document.querySelectorAll('input[type="range"]'))
    return {
      hasCharacterSelect: !!charSel,
      characterCount: charSel ? charSel.options.length : 0,
      selectedCharacter: charSel ? charSel.options[charSel.selectedIndex].text : '',
      selectedStyle: styleSel ? styleSel.options[styleSel.selectedIndex].text : '',
      sliderCount: ranges.length,
      sliderValues: ranges.map(r => r.value),
      hasPreview: !!byText('試聴'),
      text: (document.body.innerText || '').slice(0, 20)
    }
  })()`
}

// 一覧が無い時の表示を読む（ポートは触らない）
function readOffline() {
  return `(() => {${helpers}
    const text = document.body.innerText || ''
    const hasList = Array.from(document.querySelectorAll('select')).some(x => Array.from(x.options).some(o => /里石ユカ|ずんだもん/.test(o.text)))
    return {
      hasList,
      showsName: /里石ユカ（つぼみ）/.test(text),
      showsBareNumberInput: !!document.querySelector('input[type="number"][aria-label]'),
      explains: /VOICEVOXを起動すると/.test(text),
      hasPreviewButton: !!byText('試聴')
    }
  })()`
}

// 何も操作せず、一覧が現れるのを待つ（自動再試行の検証）
function waitForList(maxMs) {
  return `(async () => {${helpers}
    const t0 = Date.now()
    while (Date.now() - t0 < ${maxMs}) {
      await sleep(250)
      const hit = Array.from(document.querySelectorAll('select')).some(x => Array.from(x.options).some(o => /里石ユカ/.test(o.text)))
      if (hit) return { recovered: true, ms: Date.now() - t0 }
    }
    return { recovered: false, ms: Date.now() - t0 }
  })()`
}

// ポートを本物のエンジンに向けて保存する（以降の合成は本物で行う）
function switchToRealEngine() {
  return `(async () => {${helpers}
    const port = Array.from(document.querySelectorAll('input[type="number"]'))[0]
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(port, '50021')
    port.dispatchEvent(new Event('input', { bubbles: true }))
    port.dispatchEvent(new Event('blur', { bubbles: true }))
    for (let i=0;i<60;i++){
      await sleep(250)
      const sels = Array.from(document.querySelectorAll('select')).filter(x => Array.from(x.options).some(o => /里石ユカ/.test(o.text)))
      if (sels.length && sels[0].options.length > 10) break
    }
    const save = byText('保存')
    if (save) { save.click(); await sleep(600) }
    return { saved: !!save }
  })()`
}

function previewVoice() {
  return `(async () => {${helpers}
    const b = byText('試聴'); if (!b) return { ok:false, step:'no preview button' }
    b.click()
    // 鳴っている間はボタンが「試聴を停止」に変わる
    let sawStop = false
    for (let i=0;i<50;i++){ await sleep(200); if (byText('試聴を停止')) { sawStop = true; break } }
    for (let i=0;i<60;i++){ await sleep(200); if (!byText('試聴を停止')) break }
    const text = document.body.innerText || ''
    return { ok: true, sawStop, stillBusy: !!byText('試聴を停止'), errorShown: /ありません|失敗|繋がりません/.test(text) }
  })()`
}

// 試聴中に停止を押すと止まる
function stopMidPreview() {
  return `(async () => {${helpers}
    const b = byText('試聴'); if (!b) return { ok:false }
    b.click()
    for (let i=0;i<50;i++){ await sleep(100); if (byText('試聴を停止')) break }
    const stop = byText('試聴を停止')
    if (!stop) return { ok:false, step:'no stop button' }
    stop.click(); await sleep(300)
    return { ok: true, stopped: !!byText('試聴') && !byText('試聴を停止') }
  })()`
}

// 修飾キー + 数字。keydown を root に投げる（実キーは送れないので合成イベント）
function jumpTab(n) {
  return `(async () => {${helpers}
    const root = document.activeElement && document.activeElement.closest('[tabindex="-1"]') || document.body
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, metaKey: true, keyCode: ${48 +
      n}, key: String(${n}) })
    Object.defineProperty(e, 'keyCode', { get: () => ${48 + n} })
    ;(byText('AI') || root).dispatchEvent(e)
    await sleep(300)
    const active = buttons().find(b => /nav-button--active/.test(b.className))
    return { active: active ? active.textContent.trim() : '' }
  })()`
}

function closeModal() {
  return `(async () => {${helpers}
    const esc = buttons().find(b => /esc/i.test(b.textContent || ''))
    if (esc) esc.click()
    await sleep(300)
    return true
  })()`
}

function openNoteAndPlayer() {
  return `(async () => {${helpers}
    // 起動直後はフォルダ未選択で一覧が空。「すべてのノート」を押して出す
    const all = Array.from(document.querySelectorAll('button,div,span')).find(el => (el.textContent||'').trim() === 'すべてのノート')
    if (all) { all.click(); await sleep(400) }
    let opened = false
    for (let i=0;i<40;i++){
      const hit = Array.from(document.querySelectorAll('div,span,li,a')).find(el => (el.textContent||'').trim() === 'Read Aloud Note')
      if (hit) { let n = hit; for (let d=0; d<4 && n; d++){ n.click(); n = n.parentElement } opened = true; break }
      await sleep(250)
    }
    if (!opened) return { ok:false, step:'note not found' }
    let btn = null
    for (let i=0;i<40;i++){ btn = byLabel(/^読み上げ$|^Read aloud$/); if (btn) break; await sleep(250) }
    if (!btn) return { ok:false, step:'read-aloud button not found' }
    btn.click(); await sleep(300)
    const play = byLabel(/^再生$|^Play$/)
    const bar = play && play.parentElement
    return { ok: !!play, barVisible: !!bar && bar.getBoundingClientRect().height > 0, barTop: bar ? bar.getBoundingClientRect().top : -1,
      editorTop: (document.querySelector('.CodeMirror') || {getBoundingClientRect:()=>({top:-1})}).getBoundingClientRect().top }
  })()`
}

function readPlayerControls() {
  return `(() => {${helpers}
    return {
      hasSeek: !!document.querySelector('input[type="range"][aria-label="位置"]'),
      hasCursor: !!byLabel(/^カーソル行から再生$/)
    }
  })()`
}

// バーに focus を当てて Space。エディタにフォーカスがある時は奪わない設計なので
// バー自身へ当てる
function spaceToggles() {
  return `(async () => {${helpers}
    const play = byLabel(/^再生$|^Play$/); if (!play) return { started:false }
    const bar = play.parentElement
    bar.focus()
    const press = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    press()
    let started = false
    // 合成が終わって実際に鳴り始める（N / M が出る）まで待ってから 2 回目を押す
    for (let i=0;i<80;i++){ await sleep(250); if (byLabel(/^一時停止$|^Pause$/) && /\\d+ \\/ \\d+/.test(bar.innerText || '')) { started = true; break } }
    press(); await sleep(300)
    const paused = !!byLabel(/^再生$|^Play$/) && /\\d+ \\/ \\d+/.test(bar.innerText || '')
    return { started, paused }
  })()`
}

// エディタで打鍵中は Space を奪わない。バーに hover していても、である
function spaceDoesNotStealFromEditor() {
  return `(async () => {${helpers}
    const play = byLabel(/^再生$|^Play$/); if (!play) return { ok:false }
    const bar = play.parentElement
    bar.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    await sleep(100)
    const ta = document.querySelector('.CodeMirror textarea')
    if (!ta) return { ok:false, step:'no editor textarea' }
    ta.focus()
    const before = !!byLabel(/^一時停止$|^Pause$/)
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    ta.dispatchEvent(e)
    await sleep(400)
    return {
      ok: true,
      startedPlaying: !before && !!byLabel(/^一時停止$|^Pause$/),
      defaultPrevented: e.defaultPrevented
    }
  })()`
}

// プレビュー（iframe）にフォーカスがあっても Space が効く
function spaceInPreview() {
  return `(async () => {${helpers}
    const eye = byLabel(/^プレビュー$|^Preview$/)
    if (!eye) return { ok:false, step:'no preview button' }
    eye.click()
    let frame = null
    for (let i=0;i<40;i++){ await sleep(250); frame = document.querySelector('iframe'); if (frame && frame.contentDocument && frame.contentDocument.body && frame.contentDocument.body.innerHTML) break }
    if (!frame || !frame.contentDocument) return { ok:false, step:'no preview iframe' }
    const doc = frame.contentDocument
    const play = byLabel(/^再生$|^Play$/); const bar = play && play.parentElement
    if (bar) bar.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    await sleep(200)
    doc.body.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    let started = false
    for (let i=0;i<80;i++){ await sleep(250); if (byLabel(/^一時停止$|^Pause$/)) { started = true; break } }
    return { ok:true, started, hasDataLine: doc.querySelectorAll('[data-line]').length }
  })()`
}

// 読み上げ中の箇所がプレビューで色付いているか
function previewHighlight() {
  return `(async () => {${helpers}
    const frame = document.querySelector('iframe')
    const doc = frame && frame.contentDocument
    if (!doc) return { ok:false }
    for (let i=0;i<80;i++){
      await sleep(250)
      const hit = Array.from(doc.querySelectorAll('[data-line]')).filter(el => (el.style.backgroundColor || '') !== '')
      if (hit.length) return { ok:true, highlighted: hit.length, text: (hit[0].textContent||'').slice(0,20) }
    }
    return { ok:true, highlighted: 0 }
  })()`
}

// エディタ側の行ハイライト
function editorHighlight() {
  return `(async () => {${helpers}
    const pencil = byLabel(/^エディタ$|^Editor$/)
    if (pencil) { pencil.click(); await sleep(800) }
    for (let i=0;i<80;i++){
      await sleep(250)
      const n = document.querySelectorAll('.tb-tts-line').length
      if (n) return { ok:true, lines: n }
    }
    return { ok:true, lines: 0 }
  })()`
}

// 停止しても位置が残り、先頭からは別ボタン
function stopKeepsPosition() {
  return `(async () => {${helpers}
    const anyBtn = byLabel(/^再生$|^Play$/) || byLabel(/^一時停止$|^Pause$/)
    if (!anyBtn) return { ok:false, step:'no transport' }
    const bar = anyBtn.parentElement
    const readIndex = () => { const m = (bar.innerText||'').match(/(\\d+) \\/ (\\d+)/); return m ? Number(m[1]) : -1 }
    // 短いノートは再生が終わってしまうので、先頭から始め直してすぐ次へ
    const restart0 = byLabel(/^先頭から再生$/); restart0.click()
    for (let i=0;i<60;i++){ await sleep(200); if (readIndex() === 1 && byLabel(/^一時停止$|^Pause$/)) break }
    const next = byLabel(/^次へ$|^Next$/)
    next.click()
    let before = -1
    for (let i=0;i<60;i++){ await sleep(200); before = readIndex(); if (before === 2 && !/合成中/.test(bar.innerText||'')) break }
    const stop = buttons().find(b => /^停止/.test(b.getAttribute('aria-label')||''))
    if (!stop) return { ok:false, step:'no stop button' }
    stop.click(); await sleep(400)
    const afterStop = readIndex()
    const restart = byLabel(/^先頭から再生$/)
    if (!restart) return { ok:false, step:'no restart button' }
    restart.click()
    // 先頭の塊の合成が終わるまで待つ（「合成中…」の間は番号が出ない）
    let afterRestart = -1
    for (let i=0;i<50;i++){ await sleep(200); afterRestart = readIndex(); if (afterRestart !== -1) break }
    return { ok:true, before, afterStop, afterRestart }
  })()`
}

// 次へを素早く 2 回。位置が 2 進み、進んだ先が鳴る（同じ塊を読み直さない）
function nextTwiceJumps() {
  return `(async () => {${helpers}
    const anyBtn = byLabel(/^再生$|^Play$/) || byLabel(/^一時停止$|^Pause$/)
    const bar = anyBtn.parentElement
    const readIndex = () => { const m = (bar.innerText||'').match(/(\\d+) \\/ (\\d+)/); return m ? Number(m[1]) : -1 }
    const restart = byLabel(/^先頭から再生$/); restart.click()
    for (let i=0;i<60;i++){ await sleep(250); if (readIndex() === 1 && byLabel(/^一時停止$|^Pause$/)) break }
    const before = readIndex()
    const next = byLabel(/^次へ$|^Next$/)
    next.click(); next.click()
    let after = -1
    for (let i=0;i<60;i++){ await sleep(250); after = readIndex(); if (after === before + 2 && !/合成中/.test(bar.innerText||'')) break }
    return { ok: true, before, after }
  })()`
}

// プレビューの段落をクリックすると、その行から読む
function clickParagraphJumps() {
  return `(async () => {${helpers}
    const eye = byLabel(/^プレビュー$|^Preview$/); if (eye) { eye.click(); await sleep(800) }
    const frame = document.querySelector('iframe'); const doc = frame && frame.contentDocument
    if (!doc) return { ok:false, step:'no preview' }
    const blocks = Array.from(doc.querySelectorAll('[data-line]'))
    const last = blocks[blocks.length - 1]
    if (!last) return { ok:false, step:'no blocks' }
    const anyBtn = byLabel(/^再生$|^Play$/) || byLabel(/^一時停止$|^Pause$/)
    const bar = anyBtn.parentElement
    const readIndex = () => { const m = (bar.innerText||'').match(/(\\d+) \\/ (\\d+)/); return m ? Number(m[1]) : -1 }
    last.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true, button: 0 }))
    let idx = -1
    for (let i=0;i<40;i++){ await sleep(250); idx = readIndex(); if (idx === 3) break }
    return { ok: true, clickedLine: last.getAttribute('data-line'), index: idx }
  })()`
}

function playAndWatch() {
  return `(async () => {${helpers}
    // 直前の検証で再生中のことがあるので、まず先頭から始め直す
    const restart = byLabel(/^先頭から再生$/)
    const play = byLabel(/^再生$|^Play$/) || byLabel(/^一時停止$|^Pause$/)
    if (!play) return { ok:false, step:'no transport' }
    if (restart) restart.click(); else play.click()
    const seen = []
    for (let i=0;i<60;i++){
      await sleep(250)
      const t = (play.parentElement.innerText || '').replace(/\\s+/g,' ').trim()
      if (seen[seen.length-1] !== t) seen.push(t)
      if (/2 \\/ /.test(t)) break
    }
    const text = play.parentElement.innerText || ''
    return { ok: true, seen: seen.slice(-6), reachedSecond: /2 \\/ /.test(text), hasError: /ありません|失敗|起動していません/.test(text), label: text }
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
        const win = BrowserWindow.getAllWindows()[0]

        const opened = await wc.executeJavaScript(openAiTab(), true)
        check('設定 → AI タブを開ける', opened && opened.ok, opened)
        // --- エンジンが居ない状態（起動直後に VOICEVOX が無い時の再現） ---
        const off = await wc.executeJavaScript(readOffline(), true)
        check(
          'エンジンが居ない時は ID の数字入力ではなく保存済みの名前を出す',
          !off.hasList && off.showsName && !off.showsBareNumberInput,
          off
        )
        check('名前が出ない理由と対処を書いている', off.explains, off)
        check(
          '繋がらない時も試聴ボタンは同じ位置に残る',
          off.hasPreviewButton,
          off
        )
        await wc.executeJavaScript(
          `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').trim() === '試聴'); if (b) b.scrollIntoView({ block: 'center' }); return true })()`,
          true
        )
        await new Promise(resolve => setTimeout(resolve, 300))
        await shoot(win, 'readaloud-offline.png')

        // --- エンジンが後から上がる。利用者は何もしない ---
        await startFakeEngine()
        const back = await wc.executeJavaScript(waitForList(30000), true)
        check('ボタンを押さずに一覧が戻る（自動再試行）', back.recovered, back)

        // --- 以降は本物のエンジンで ---
        const sw = await wc.executeJavaScript(switchToRealEngine(), true)
        check('ポートを本物に向けて保存できる', sw.saved, sw)
        const view = await wc.executeJavaScript(readAiTab(), true)
        check(
          '話者一覧がキャラクターの選択肢になっている',
          view.hasCharacterSelect,
          {
            count: view.characterCount
          }
        )
        check(
          '旧設定（話者 1）が既定の里石ユカ（つぼみ）へ移行している',
          /里石ユカ/.test(view.selectedCharacter) &&
            /つぼみ/.test(view.selectedStyle),
          { character: view.selectedCharacter, style: view.selectedStyle }
        )
        check(
          '声の調整スライダーが 7 本',
          view.sliderCount === 7,
          view.sliderValues
        )
        check(
          'スライダーの既定がやや早口（1.20）・抑揚 0.60',
          view.sliderValues[0] === '1.2' && view.sliderValues[2] === '0.6',
          view.sliderValues
        )
        // 読み上げカードは下にあるので、撮る前にそこまでスクロールする
        await wc.executeJavaScript(
          `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').trim() === '試聴'); if (b) b.scrollIntoView({ block: 'end' }); return true })()`,
          true
        )
        await new Promise(resolve => setTimeout(resolve, 300))
        await shoot(win, 'readaloud-aitab.png')

        const pv = await wc.executeJavaScript(previewVoice(), true)
        check(
          '試聴が完走し、エラーが出ない',
          pv.ok && pv.sawStop && !pv.stillBusy && !pv.errorShown,
          pv
        )
        // パラメータが合成に効いているか。話速 0.5 と 2.0 で同じ文を合成し、
        // WAV の長さ（バイト数）が明確に違えば main 側で反映されている
        const pe = await wc.executeJavaScript(
          `(async () => {
            const { ipcRenderer } = require('electron')
            const text = 'これは話速の確認です。'
            const slow = await ipcRenderer.invoke('tts:speak', { text, speakerId: 126, port: 50021, params: { speed: 0.5 } })
            const fast = await ipcRenderer.invoke('tts:speak', { text, speakerId: 126, port: 50021, params: { speed: 2 } })
            if (!slow.ok || !fast.ok) return { ok: false, slow: slow.reason, fast: fast.reason }
            return { ok: true, slowBytes: slow.wav.byteLength, fastBytes: fast.wav.byteLength, ratio: slow.wav.byteLength / fast.wav.byteLength }
          })()`,
          true
        )
        check(
          '話速のパラメータが合成に反映される（0.5 は 2.0 の 3 倍以上の長さ）',
          pe.ok && pe.ratio > 3,
          pe
        )

        const sm = await wc.executeJavaScript(stopMidPreview(), true)
        check('試聴中に押すと止まる', sm.ok && sm.stopped, sm)

        // ホットキー設定に「音声プレーヤー」の組があり、既定が埋まっている
        const hk = await wc.executeJavaScript(jumpTab(2), true)
        const hkView = await wc.executeJavaScript(
          `(() => {
            const text = document.body.innerText || ''
            const inputs = Array.from(document.querySelectorAll('input[type="text"]'))
            const player = inputs.filter(i => /Command \\+ (Shift|Alt) \\+ (P|\\.|Left|Right|Up|Down)$/.test(i.value))
            return { hasGroup: text.indexOf('音声プレーヤー') !== -1, playerInputs: player.length, values: player.map(i => i.value) }
          })()`,
          true
        )
        check(
          'ホットキー設定に音声プレーヤーの組がある',
          hk.active === 'ホットキー' && hkView.hasGroup,
          hkView
        )
        check(
          '音声プレーヤーのホットキー 8 本に既定が入っている',
          hkView.playerInputs === 8,
          hkView.values
        )

        const jump = await wc.executeJavaScript(jumpTab(5), true)
        check(
          '修飾キー + 5 でエクスポートタブへ移る',
          jump.active === 'エクスポート',
          jump
        )
        const jump2 = await wc.executeJavaScript(jumpTab(7), true)
        check('修飾キー + 7 で AI タブへ戻る', jump2.active === 'AI', jump2)

        await wc.executeJavaScript(closeModal(), true)
        const np = await wc.executeJavaScript(openNoteAndPlayer(), true)
        check(
          'ノートのスピーカーボタンで再生バーが出る',
          np.ok && np.barVisible,
          np
        )
        check(
          '再生バーが本文の上にあり、本文と重ならない',
          np.ok && np.barTop >= 0 && np.editorTop > np.barTop + 30,
          { barTop: np.barTop, editorTop: np.editorTop }
        )
        const ctl = await wc.executeJavaScript(readPlayerControls(), true)
        check(
          'シークバーとカーソル行からのボタンがある',
          ctl.hasSeek && ctl.hasCursor,
          ctl
        )
        await shoot(win, 'readaloud-bar.png')
        const sp = await wc.executeJavaScript(spaceToggles(), true)
        check('バーにフォーカスがある時 Space で再生が始まる', sp.started, sp)
        check('もう一度 Space で一時停止', sp.paused, sp)
        const noSteal = await wc.executeJavaScript(
          spaceDoesNotStealFromEditor(),
          true
        )
        check(
          'エディタで打鍵中は Space を奪わない（文字が入る）',
          noSteal.ok && !noSteal.startedPlaying && !noSteal.defaultPrevented,
          noSteal
        )

        const inPreview = await wc.executeJavaScript(spaceInPreview(), true)
        check(
          'プレビュー（iframe）にフォーカスがあっても Space で再生できる',
          inPreview.ok && inPreview.started,
          inPreview
        )
        const ph = await wc.executeJavaScript(previewHighlight(), true)
        check(
          '読み上げ中の箇所がプレビューで色付く',
          ph.ok && ph.highlighted > 0,
          ph
        )
        await shoot(win, 'readaloud-highlight-preview.png')

        const eh = await wc.executeJavaScript(editorHighlight(), true)
        check('読み上げ中の行がエディタでも色付く', eh.ok && eh.lines > 0, eh)
        await shoot(win, 'readaloud-highlight-editor.png')

        const nx = await wc.executeJavaScript(nextTwiceJumps(), true)
        check(
          '次へを 2 回で 2 つ先へ飛ぶ（同じ塊を読み直さない）',
          nx.ok && nx.after === nx.before + 2,
          nx
        )
        const cj = await wc.executeJavaScript(clickParagraphJumps(), true)
        check(
          'プレビューの段落をクリックするとそこから読む',
          cj.ok && cj.index === 3,
          cj
        )

        // 再生中に話速を変えても「合成中…」で止まらない（playbackRate で追従）
        const sm2 = await wc.executeJavaScript(
          `(async () => {${helpers}
            const anyBtn = byLabel(/^再生$|^Play$/) || byLabel(/^一時停止$|^Pause$/)
            const bar = anyBtn.parentElement
            const restart = byLabel(/^先頭から再生$/); restart.click()
            for (let i=0;i<60;i++){ await sleep(250); if (byLabel(/^一時停止$|^Pause$/) && !/合成中/.test(bar.innerText||'')) break }
            const sel = bar.querySelector('select[aria-label="話速"]')
            const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
            setter.call(sel, '2'); sel.dispatchEvent(new Event('change', { bubbles: true }))
            let sawSynth = false
            for (let i=0;i<8;i++){ await sleep(100); if (/合成中/.test(bar.innerText||'')) sawSynth = true }
            return { ok: true, sawSynth, speed: sel.value, help: !!byLabel(/^キー操作の案内$/) }
          })()`,
          true
        )
        check(
          '再生中の話速変更で合成待ちに戻らない',
          sm2.ok && !sm2.sawSynth && sm2.speed === '2',
          sm2
        )
        check('キー案内ボタンがある', sm2.help, sm2)

        // 移動単位: バーの単位セレクトを「見出し」にすると目盛りが節の数になる
        const un = await wc.executeJavaScript(
          `(async () => {${helpers}
            const anyBtn = byLabel(/^再生$|^Play$/) || byLabel(/^一時停止$|^Pause$/)
            const bar = anyBtn.parentElement
            const sel = bar.querySelector('select[aria-label="移動の単位"]')
            if (!sel) return { ok:false, step:'no unit select' }
            const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
            const read = () => { const r = bar.querySelector('input[type="range"][aria-label="位置"]'); return Number(r.max) }
            setter.call(sel, 'chunk'); sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200)
            const chunkMax = read()
            setter.call(sel, 'section'); sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200)
            const sectionMax = read()
            setter.call(sel, 'paragraph'); sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200)
            return { ok:true, chunkMax, sectionMax, paragraphMax: read() }
          })()`,
          true
        )
        check(
          '移動単位を切り替えると位置バーの目盛りが変わる（塊 3 / 見出し 1 / 段落 3）',
          un.ok &&
            un.chunkMax === 3 &&
            un.sectionMax === 1 &&
            un.paragraphMax === 3,
          un
        )

        const sk = await wc.executeJavaScript(stopKeepsPosition(), true)
        check(
          '停止しても位置が残り、先頭から再生は別ボタン',
          sk.ok &&
            sk.before > 1 &&
            sk.afterStop === sk.before &&
            sk.afterRestart === 1,
          sk
        )
        await wc.executeJavaScript(
          `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^停止/.test(x.getAttribute('aria-label')||'')); if (b) b.click(); return true })()`,
          true
        )
        const pl = await wc.executeJavaScript(playAndWatch(), true)
        check(
          '再生で 2 塊目まで進む（VOICEVOX 実合成）',
          pl.ok && pl.reachedSecond && !pl.hasError,
          pl
        )
        await shoot(win, 'readaloud-playing.png')

        // 改善提案ペイン（AI キー無しでも開ける。分析は押さない）
        const sg = await wc.executeJavaScript(
          `(async () => {${helpers}
            const editor = document.querySelector('.CodeMirror')
            const before = editor ? editor.getBoundingClientRect().right : -1
            const btn = byLabel(/^改善提案（AI）$/)
            if (!btn) return { ok:false, step:'no button' }
            btn.click(); await sleep(400)
            const pane = document.querySelector('.SuggestionsPane')
            const analyze = byText('分析する') || Array.from(document.querySelectorAll('button')).find(b => /分析する/.test(b.textContent||''))
            const after = editor ? editor.getBoundingClientRect().right : -1
            const paneLeft = pane ? pane.getBoundingClientRect().left : -1
            return { ok:true, pane: !!pane, analyze: !!analyze, noOverlap: paneLeft >= after - 2, before, after, paneLeft, scope: pane ? (pane.innerText.match(/対象: (\\S+)/)||[])[1] : '' }
          })()`,
          true
        )
        check(
          '改善提案ペインが右の列に開き、本文と重ならない',
          sg.ok && sg.pane && sg.analyze && sg.noOverlap,
          sg
        )
        check(
          '対象がノート全体と表示される（選択なし）',
          /ノート全体/.test(sg.scope || ''),
          sg
        )

        finish(checks.every(c => c.pass) ? 0 : 1, {})
      } catch (err) {
        finish(2, { error: 'exec failed: ' + err.message })
      }
    }, 4000)
  })
})

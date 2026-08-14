// スニペットノートでキーワード検索・置換が動くかを実機で測る probe。
//
// v0.21.0 で内蔵の検索を殺して自前の FindBar に置き換えたとき、受け口を
// Markdown ノートにしか用意しなかった。Cmd/Ctrl+F は main プロセスの
// before-input-event が preventDefault で握り潰すので、**スニペットノートでは
// 検索も置換もひとつも動かなかった**。同じ穴を二度開けないために、
// 「押した結果どうなるか」だけを観測する。
//
// 合成イベント(dispatchEvent)は既定動作もフォーカス経路も本物と違うので、
// キー入力は webContents.sendInputEvent() で撃つ。
//
// Exit: 0 全部 PASS / 1 FAIL あり / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-snippetfind-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-snippetfind-'))
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

function check(label, ok, data) {
  rows.push({ label, verdict: ok ? 'PASS' : 'FAIL', data })
  return ok
}

function finish(code, result) {
  if (finished) return
  finished = true
  console.log('\n=== snippet find probe ===')
  rows.forEach(r =>
    console.log(
      `${r.verdict || 'ROW '}  ${r.label} — ${JSON.stringify(r.data)}`
    )
  )
  const failed = rows.filter(r => r.verdict === 'FAIL').length
  const passed = rows.filter(r => r.verdict === 'PASS').length
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
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
    if (localStorage.getItem('__snipFindSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__snipFindSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

function press(wc, keyCode, modifiers) {
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  return new Promise(resolve => setTimeout(resolve, 500))
}

/**
 * 実際に打鍵して入力欄へ文字を入れる（値の直接代入では onChange 経路を測れない）。
 * keyDown / char / keyUp の3点を撃つ。char だけだと届かない
 */
async function type(wc, text) {
  for (const ch of text) {
    wc.sendInputEvent({ type: 'keyDown', keyCode: ch })
    wc.sendInputEvent({ type: 'char', keyCode: ch })
    wc.sendInputEvent({ type: 'keyUp', keyCode: ch })
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  await new Promise(resolve => setTimeout(resolve, 400))
}

/**
 * 打鍵の前に入力欄へフォーカスを入れ直す。
 * probe の window は show:false なので、**アプリ側が focus() を済ませていても**
 * ウィジェットの入力先が確定しないことがある（隠しウィンドウ固有の事情）。
 * 「Cmd+F でフォーカスが入るか」は DOM の activeElement で別途見ているので、
 * ここで入れ直しても検証は緩まない
 */
function focusInput(wc, index) {
  return wc.executeJavaScript(
    `(() => {
       const inputs = Array.from(document.querySelectorAll('.FindBar input'))
       const el = inputs[${index}]
       if (!el) return false
       el.focus()
       return document.activeElement === el
     })()`,
    true
  )
}

// FindBar の状態をまとめて読む。件数は span の文字列そのままを見る
const BAR_STATE = `(() => {
  const bar = document.querySelector('.FindBar')
  if (!bar) return { open: false }
  const inputs = Array.from(bar.querySelectorAll('input'))
  const buttons = Array.from(bar.querySelectorAll('button'))
  const cm = document.querySelector('.CodeMirror')
  return {
    open: true,
    inputCount: inputs.length,
    queryValue: inputs[0] ? inputs[0].value : null,
    replaceValue: inputs[1] ? inputs[1].value : null,
    // 件数表示は "1 / 3" の形。CSS 由来の文字列が混ざらないよう span だけ見る
    spans: Array.from(bar.querySelectorAll('span'))
      .map(s => (s.textContent || '').trim())
      .filter(Boolean),
    buttonLabels: buttons.map(b => (b.textContent || '').trim()),
    focusedIsBarInput: inputs.indexOf(document.activeElement),
    marks: document.querySelectorAll('.tb-find-all').length,
    selection: cm && cm.CodeMirror ? cm.CodeMirror.getSelection() : null,
    editorValue: cm && cm.CodeMirror ? cm.CodeMirror.getValue() : null,
    // 内蔵ダイアログが復活していないこと（IME 変換の確定 Enter で閉じる）
    legacyDialog: document.querySelectorAll('.CodeMirror-dialog').length
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
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await s(250) }
             return true })()`,
          true
        )

        // --- スニペットノートを作って本文を入れる ---
        const made = await wc.executeJavaScript(
          `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
             const b = document.querySelector('.NewNoteButton button')
             if (!b) return { ok:false, step:'no NewNoteButton' }
             b.click(); await sleep(700)
             const modal = document.querySelector('.ModalBase') || document
             const snip = Array.from(modal.querySelectorAll('button'))
               .find(x => /snippet|スニペット/i.test(x.textContent))
             if (!snip) return { ok:false, step:'no snippet button' }
             snip.click()
             let cm = null
             for (let i=0;i<40;i++){
               cm = document.querySelector('.CodeMirror')
               if (cm && cm.CodeMirror && cm.CodeMirror.getValue() === '') break
               cm = null; await sleep(250)
             }
             if (!cm) return { ok:false, step:'no empty editor' }
             cm.CodeMirror.setValue('needle one\\nalpha needle beta\\nneedle again\\n')
             await sleep(1200)
             return { ok:true, isSnippet: !!document.querySelector('[class*="tabList"]') }
           })()`,
          true
        )
        rows.push({ label: 'スニペットノートを作る', data: made })
        if (!made.ok) return finish(2, { error: 'setup: ' + made.step })

        // --- エディタへフォーカスしてから Cmd+F ---
        const editorPos = await wc.executeJavaScript(
          `(() => { const cm = document.querySelector('.CodeMirror')
             if (!cm) return null
             const r = cm.getBoundingClientRect()
             return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + 30) } })()`,
          true
        )
        if (editorPos) {
          wc.sendInputEvent({
            type: 'mouseDown',
            x: editorPos.x,
            y: editorPos.y,
            button: 'left',
            clickCount: 1
          })
          wc.sendInputEvent({
            type: 'mouseUp',
            x: editorPos.x,
            y: editorPos.y,
            button: 'left',
            clickCount: 1
          })
          await new Promise(resolve => setTimeout(resolve, 400))
        }

        const SUPER = process.platform === 'darwin' ? 'cmd' : 'control'
        await press(wc, 'F', [SUPER])
        const opened = await wc.executeJavaScript(BAR_STATE, true)
        // ここが本題。v0.21.0〜v0.24.0 は open:false のまま何も起きなかった
        check('Cmd+F で検索バーが開く', opened.open === true, opened)
        check(
          '内蔵の検索ダイアログは出ない',
          opened.legacyDialog === 0,
          opened.legacyDialog
        )
        if (!opened.open) return finish(1, { error: 'FindBar が開かない' })
        check(
          '開いた直後は検索欄にフォーカスがある',
          opened.focusedIsBarInput === 0,
          opened.focusedIsBarInput
        )

        // --- 実際に打鍵して探す ---
        await focusInput(wc, 0)
        await type(wc, 'needle')
        const searched = await wc.executeJavaScript(BAR_STATE, true)
        check('打鍵した文字が入る', searched.queryValue === 'needle', searched)
        check(
          '件数が出る (0 / 3)',
          searched.spans.some(s => /\\b3$/.test(s) || s === '0 / 3'),
          searched.spans
        )
        check(
          '一致箇所がハイライトされる',
          searched.marks === 3,
          searched.marks
        )
        check(
          '**入力しただけでは現在地は動かない**',
          !searched.selection,
          searched.selection
        )

        // --- Enter で次へ ---
        await press(wc, 'Return', [])
        const stepped = await wc.executeJavaScript(BAR_STATE, true)
        check(
          'Enter で1件目を選ぶ',
          stepped.selection === 'needle',
          stepped.selection
        )
        check(
          'Enter で件数表示が 1 / 3 になる',
          stepped.spans.some(s => s === '1 / 3'),
          stepped.spans
        )

        // --- 置換行を開いて、すべて置換 ---
        const toggled = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             const bar = document.querySelector('.FindBar')
             if (!bar) return { ok:false, step:'no bar' }
             const toggle = bar.querySelector('button')
             if (!toggle) return { ok:false, step:'no toggle' }
             toggle.click(); await sleep(400)
             const inputs = Array.from(bar.querySelectorAll('input'))
             if (inputs.length < 2) return { ok:false, step:'no replace input' }
             inputs[1].focus()
             return { ok:true, inputCount: inputs.length }
           })()`,
          true
        )
        check('置換行が開く', toggled.ok === true, toggled)
        if (!toggled.ok) return finish(1, { error: '置換行が開かない' })

        await type(wc, 'pin')
        const typedReplace = await wc.executeJavaScript(BAR_STATE, true)
        check(
          '置換欄に打鍵できる',
          typedReplace.replaceValue === 'pin',
          typedReplace.replaceValue
        )

        // 見た目の確認用。**ビルドが通ることと正しく描かれることは別**なので、
        // 検索欄と置換欄が両方見えている状態を必ず1枚撮る
        const openShot = await win.webContents.capturePage()
        const openShotPath = path.join(
          process.env.TB_SHOT_DIR || os.tmpdir(),
          'snippet-find-open.png'
        )
        fs.writeFileSync(openShotPath, openShot.toPNG())
        rows.push({ label: 'SHOT (置換行を開いた状態)', data: openShotPath })

        const clickedAll = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             const bar = document.querySelector('.FindBar')
             const btn = Array.from(bar.querySelectorAll('button'))
               .find(b => /replace all|すべて置換/i.test(b.textContent || ''))
             if (!btn) return { ok:false, labels: Array.from(bar.querySelectorAll('button')).map(b=>b.textContent) }
             btn.click(); await sleep(700)
             return { ok:true }
           })()`,
          true
        )
        check('すべて置換のボタンがある', clickedAll.ok === true, clickedAll)

        const replaced = await wc.executeJavaScript(BAR_STATE, true)
        check(
          'すべて置換が本文に効く',
          replaced.editorValue === 'pin one\nalpha pin beta\npin again\n',
          replaced.editorValue
        )
        check(
          '置換後は一致0件になる',
          replaced.marks === 0 && replaced.spans.some(s => s === '0 / 0'),
          { marks: replaced.marks, spans: replaced.spans }
        )

        // --- 保存されるか（置換はエディタの change 経路を通る） ---
        const saved = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             await sleep(2000)
             return { ok:true }
           })()`,
          true
        )
        void saved
        const files = fs
          .readdirSync(path.join(storageDir, 'notes'))
          .filter(f => f.endsWith('.cson'))
        const body = files.length
          ? fs.readFileSync(path.join(storageDir, 'notes', files[0]), 'utf8')
          : ''
        check(
          '置換の結果がディスクへ保存される',
          body.includes('pin one') && !body.includes('needle'),
          { files: files.length, hasPin: body.includes('pin one') }
        )

        // --- Esc で閉じる ---
        await press(wc, 'Escape', [])
        const closed = await wc.executeJavaScript(BAR_STATE, true)
        check('Esc で閉じる', closed.open === false, closed)

        const img = await win.webContents.capturePage()
        const shot = path.join(
          process.env.TB_SHOT_DIR || os.tmpdir(),
          'snippet-find.png'
        )
        fs.writeFileSync(shot, img.toPNG())
        rows.push({ label: 'SHOT', data: shot })

        const failed = rows.filter(r => r.verdict === 'FAIL').length
        finish(failed > 0 ? 1 : 0, {})
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

// カスタム CSS のテンプレート挿入を実機の描画で確かめるプローブ。
//
// 単体テストは appendCustomCSSTemplate の入出力までしか見られない。ここで見るのは
// 配線のほう。
// - select と挿入ボタンが実際に描かれ、ラベルが訳されていること（キーが素で
//   出ていたら i18n を経由していない）
// - 挿入で CodeMirror の中身が増え、**先に書いてあった内容が残る**こと
// - react-codemirror は origin === 'setValue' の変更で onChange を呼ばないので、
//   保存したときに config へ実際に載ること（ここが抜けると画面だけ変わる）
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-customcss-result.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-customcss-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'cssfolder', name: 'C', color: '#E10051' }],
    version: '1.0'
  })
)
app.setPath('userData', path.join(tmpRoot, 'userData'))
app.setPath('home', tmpRoot)

const consoleLogs = []
let finished = false
let ran = false
function finish(code, result) {
  if (finished) return
  finished = true
  // CI では結果ファイルを読めないので、判定は必ず stdout に出す
  const rep = (result && result.rep) || {}
  console.log('CUSTOMCSS_PROBE ' + (code === 0 ? 'PASS' : 'FAIL'))
  console.log('CUSTOMCSS_PROBE result ' + JSON.stringify(result).slice(0, 4000))
  if (Array.isArray(rep.checks)) {
    rep.checks.forEach(c =>
      console.log(`CUSTOMCSS_PROBE ${c.ok ? 'PASS' : 'FAIL'} ${c.name}`)
    )
  }
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, result, consoleLogs }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 90000)

function seed() {
  return `(() => { let l=[]; try{l=JSON.parse(localStorage.getItem('storages'))||[]}catch(e){}
    if(!Array.isArray(l)||!l.length){localStorage.setItem('storages',JSON.stringify([{key:'cs',name:'C',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]));
    localStorage.setItem('config',JSON.stringify({zoom:1,isSideNavFolded:false,listWidth:280}));
    setTimeout(()=>location.reload(),50);return false} return true })()`
}

function driver() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const rep = { steps: [], checks: [] }
    const check = (name, ok, extra) => { rep.checks.push(Object.assign({ name, ok: !!ok }, extra || {})); return !!ok }
    const q = sel => Array.from(document.querySelectorAll(sel))
    const findButton = re => q('button').find(b => re.test((b.textContent || '').trim()))

    try {
      window.__err = []
      window.addEventListener('error', e => window.__err.push(String((e.error && (e.error.stack || e.error.message)) || e.message)))

      for (let i = 0; i < 40; i++) {
        if (!document.getElementById('loadingCover') && document.getElementById('content') && document.getElementById('content').children.length > 0) break
        await sleep(250)
      }
      rep.steps.push('ui-ready')

      const prefBtn = q('button').find(b => {
        const img = b.querySelector('img'); return img && /setting/i.test(img.getAttribute('src') || '')
      })
      if (!prefBtn) return { ok: false, rep, error: 'preference button not found' }
      prefBtn.click(); await sleep(700)
      // ラベルは日英併記で探す。日本語決め打ちは英語ロケールで別の意味で落ちる
      const uiTab = findButton(/interface|インターフェース/i)
      if (!uiTab) return { ok: false, rep, error: 'interface tab not found' }
      uiTab.click(); await sleep(700)
      rep.steps.push('preferences-open')

      // テンプレートの select は id で特定する（他の select と取り違えない）
      const sel = document.getElementById('customCSSTemplate')
      if (!sel) return { ok: false, rep, step: 'select', error: 'template select not found' }
      rep.optionValues = Array.from(sel.options).map(o => o.value)
      rep.optionLabels = Array.from(sel.options).map(o => (o.textContent || '').trim())
      check('選択肢が 5 件以上ある', rep.optionValues.length >= 5, { count: rep.optionValues.length })
      check('id が一意', new Set(rep.optionValues).size === rep.optionValues.length)
      // 訳が当たっていればラベルはキー（英語）と一致しない
      rep.untranslated = rep.optionLabels.filter((label, i) => label === rep.optionValues[i] || /^[\\x00-\\x7F]+$/.test(label))
      check('ラベルが訳されている', rep.untranslated.length === 0, { untranslated: rep.untranslated })

      // 注記の箇条書きが描かれているか（選択に追従することも見る）
      const notesOf = () => {
        const box = sel.closest('div').parentElement.querySelector('ul')
        return box ? Array.from(box.querySelectorAll('li')).map(li => (li.textContent || '').trim()) : null
      }
      rep.notesFirst = notesOf()
      check('注記が描かれている', Array.isArray(rep.notesFirst) && rep.notesFirst.length > 0, { notes: rep.notesFirst })

      const setSelect = v => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
        setter.call(sel, v)
        sel.dispatchEvent(new Event('change', { bubbles: true }))
      }
      setSelect(rep.optionValues[1]); await sleep(300)
      rep.notesSecond = notesOf()
      check('選択を変えると注記も変わる', JSON.stringify(rep.notesFirst) !== JSON.stringify(rep.notesSecond))

      // カスタム CSS の CodeMirror。select と同じ group-section の中にある
      const section = sel.closest('div').parentElement
      const cmEl = section.querySelector('.CodeMirror')
      if (!cmEl || !cmEl.CodeMirror) return { ok: false, rep, step: 'codemirror', error: 'custom css editor not found' }
      const cm = cmEl.CodeMirror
      rep.before = cm.getValue()
      // 既定のカスタム CSS（Boostnote 由来の見本）が入っている前提。空だと
      // 「消さない」ことを確かめられないので、そこで落とす
      check('挿入前の内容が空でない', rep.before.trim().length > 0, { before: rep.before.slice(0, 80) })
      const trimEnd = v => v.replace(/\s*$/, '')

      const insertBtn = Array.from(section.querySelectorAll('button')).find(b => /insert|挿入/i.test((b.textContent || '').trim()))
      if (!insertBtn) return { ok: false, rep, step: 'insert-button', error: 'insert button not found' }
      insertBtn.click(); await sleep(500)
      rep.afterFirst = cm.getValue()
      check('挿入で内容が増える', rep.afterFirst.length > rep.before.length)
      check('先に書いてあった内容が残る', rep.afterFirst.indexOf(trimEnd(rep.before)) === 0)
      check('挿入されたコメントも訳されている', /\\/\\* [^\\x00-\\x7F]/.test(rep.afterFirst), { head: rep.afterFirst.slice(0, 200) })

      // 2 件目を続けて挿入しても 1 件目が残る
      setSelect(rep.optionValues[2]); await sleep(250)
      insertBtn.click(); await sleep(500)
      rep.afterSecond = cm.getValue()
      check('続けて挿入しても前の分が残る', rep.afterSecond.indexOf(trimEnd(rep.afterFirst)) === 0 && rep.afterSecond.length > rep.afterFirst.length)

      const saveBtn = findButton(/^(save|保存)$/i)
      rep.saveFound = !!saveBtn
      if (saveBtn) { saveBtn.click(); await sleep(900) }
      const stored = (JSON.parse(localStorage.getItem('config') || '{}').preview || {}).customCSS || ''
      rep.storedLength = stored.length
      // setValue の変更は onChange を呼ばないので、ここが本命の検査
      check('保存すると config に載る', stored === rep.afterSecond, { storedHead: stored.slice(0, 80) })

      rep.errors = window.__err
      check('例外が出ていない', rep.errors.length === 0, { errors: rep.errors })

      return { ok: rep.checks.every(c => c.ok), rep }
    } catch (err) {
      return { ok: false, rep, error: String((err && (err.stack || err.message)) || err) }
    }
  })()`
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (_ev, level, message) =>
    consoleLogs.push({ level, message: String(message).slice(0, 300) })
  )
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true
        const r = await wc.executeJavaScript(driver(), true)
        // 判定は DOM で取れるが、収まり（400px の枠に入っているか）は絵で見る
        if (process.env.TB_E2E_SHOT) {
          try {
            const image = await wc.capturePage()
            fs.writeFileSync(process.env.TB_E2E_SHOT, image.toPNG())
            console.log('CUSTOMCSS_PROBE shot ' + process.env.TB_E2E_SHOT)
          } catch (e) {}
        }
        finish(r && r.ok ? 0 : 1, r)
      } catch (err) {
        finish(2, { error: 'exec failed: ' + err.message })
      }
    }, 4000)
  })
})

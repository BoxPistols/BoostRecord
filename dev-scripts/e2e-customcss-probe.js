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

// ラベルの検査は「ASCII でないこと」では出来ない。英語ロケールでは正しい訳も
// ASCII なので、同じ検査が別の意味で落ちる。実際に表示されている文字列を、
// 実行中のロケールの locales/*.json と突き合わせる
const templateSource = fs.readFileSync(
  path.join(__dirname, '..', 'browser', 'lib', 'customCSSTemplates.js'),
  'utf8'
)
const LABEL_KEY_BY_ID = {}
const labelRe = /id:\s*'([^']+)',\s*labelKey:\s*'((?:[^'\\]|\\.)*)'/g
let labelMatch
while ((labelMatch = labelRe.exec(templateSource))) {
  LABEL_KEY_BY_ID[labelMatch[1]] = labelMatch[2].replace(/\\'/g, "'")
}
const LOCALE_DICTS = {}
for (const file of fs.readdirSync(path.join(__dirname, '..', 'locales'))) {
  if (!file.endsWith('.json')) continue
  try {
    const dict = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'locales', file), 'utf8')
    )
    const picked = {}
    for (const key of Object.values(LABEL_KEY_BY_ID)) {
      if (key in dict) picked[key] = dict[key]
    }
    LOCALE_DICTS[file.replace('.json', '')] = picked
  } catch (e) {}
}

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
    const LABEL_KEY_BY_ID = ${JSON.stringify(LABEL_KEY_BY_ID)}
    const LOCALE_DICTS = ${JSON.stringify(LOCALE_DICTS)}
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
      // 実行中のロケールの訳と突き合わせる。ASCII かどうかでは判定しない
      // （英語ロケールでは正しい訳も ASCII で、別の意味で落ちる）
      // ConfigManager は DEFAULT_CONFIG との merge 結果を localStorage へ書き戻さ
      // ないので、保存値ではなく画面が実際に使っている値（言語の select）を見る
      const langSelect = q('select').find(el => {
        const values = Array.from(el.options).map(o => o.value)
        // getLanguages() は en / ja だけを返す（locales/ に 21 ファイルあるが
        // i18n-2 に渡しているのはこの 2 つだけ）。多い方に合わせて探さない
        return values.indexOf('ja') !== -1 && values.indexOf('en') !== -1
      })
      rep.language = langSelect ? langSelect.value : null
      const dict = LOCALE_DICTS[rep.language] || {}
      rep.localeHasTranslations = Object.keys(dict).length
      check('実行中のロケールが分かる', !!rep.language, { language: rep.language })
      check('そのロケールにテンプレート名の訳がある', rep.localeHasTranslations >= rep.optionValues.length, { found: rep.localeHasTranslations })
      const expectedLabel = id => {
        const key = LABEL_KEY_BY_ID[id]
        return key === undefined ? null : (dict[key] !== undefined ? dict[key] : key)
      }
      rep.labelMismatch = rep.optionValues
        .map((id, i) => ({ id, shown: rep.optionLabels[i], expected: expectedLabel(id) }))
        .filter(row => row.expected === null || row.shown !== row.expected)
      check('ラベルが i18n を通っている', rep.labelMismatch.length === 0, { mismatch: rep.labelMismatch })

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
      rep.insertedTemplateId = sel.value
      const insertedLabel = expectedLabel(rep.insertedTemplateId)
      check('挿入されたコメントも実行中のロケールの文面になる', insertedLabel !== null && rep.afterFirst.indexOf('/* ' + insertedLabel + ' */') !== -1, { insertedLabel: insertedLabel })

      // 2 件目を続けて挿入しても 1 件目が残る
      setSelect(rep.optionValues[2]); await sleep(250)
      insertBtn.click(); await sleep(500)
      rep.afterSecond = cm.getValue()
      check('続けて挿入しても前の分が残る', rep.afterSecond.indexOf(trimEnd(rep.afterFirst)) === 0 && rep.afterSecond.length > rep.afterFirst.length)

      // キー未設定のときに AI の導線を出さない。押しても必ず失敗する導線は
      // 出さない、というのがこの機能の前提条件
      rep.aiRowBeforeKey = !!document.getElementById('customCSSPrompt')
      check('キーが無いときは AI の導線を出さない', rep.aiRowBeforeKey === false)

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

// 環境変数だけでキーが揃った状態を作り、設定画面を開き直して導線が出ることを見る。
// 実際の生成は呼ばない（CI から外部 API を叩かないため）
function driverWithKey() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const rep = { checks: [] }
    const check = (name, ok, extra) => { rep.checks.push(Object.assign({ name, ok: !!ok }, extra || {})); return !!ok }
    const q = sel => Array.from(document.querySelectorAll(sel))
    const findButton = re => q('button').find(b => re.test((b.textContent || '').trim()))
    try {
      // 設定画面を閉じて開き直す。UiTab が作り直され componentDidMount が走る
      const closeBtn = q('button').find(b => /esc/i.test((b.textContent || '').trim()))
      if (closeBtn) { closeBtn.click(); await sleep(500) }
      const prefBtn = q('button').find(b => {
        const img = b.querySelector('img'); return img && /setting/i.test(img.getAttribute('src') || '')
      })
      if (!prefBtn) return { ok: false, rep, error: 'preference button not found' }
      prefBtn.click(); await sleep(700)
      const uiTab = findButton(/interface|インターフェース/i)
      if (!uiTab) return { ok: false, rep, error: 'interface tab not found' }
      uiTab.click(); await sleep(900)

      const input = document.getElementById('customCSSPrompt')
      check('キーがあれば AI の導線が出る', !!input)
      if (!input) return { ok: false, rep, step: 'ai-row' }

      const row = input.closest('div')
      const genBtn = Array.from(row.querySelectorAll('button')).find(b => /generate|生成/i.test((b.textContent || '').trim()))
      check('生成ボタンがある', !!genBtn)
      check('指示が空のうちは押せない', !!genBtn && genBtn.disabled === true)

      // React の制御された input なので、ネイティブの setter 経由で値を入れる
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '見出しを詰めたい')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await sleep(300)
      check('指示を入れると押せるようになる', !!genBtn && genBtn.disabled === false)

      // 撮影のため、AI の行が画面に入るところまでスクロールする
      input.scrollIntoView({ block: 'center' })
      await sleep(400)

      rep.errors = (window.__err || [])
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
        // ai:keys-status は呼ばれるたびに環境変数を見るので、ここで入れれば
        // 開き直した設定画面には導線が出る
        process.env.OPENAI_API_KEY = 'sk-e2e-not-a-real-key'
        const r2 = await wc.executeJavaScript(driverWithKey(), true)
        if (r && r.rep && r2 && r2.rep) {
          r.rep.checks = r.rep.checks.concat(r2.rep.checks)
          r.ok = r.ok && r2.ok
          if (!r2.ok && r2.error) r.error = r2.error
        } else if (r) {
          r.ok = false
          r.error = (r2 && r2.error) || 'second pass returned nothing'
        }
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

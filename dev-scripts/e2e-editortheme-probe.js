// エディタテーマの選択肢を実機で確かめるプローブ。
//
// 見るのは 3 点。
// - 選択肢が絞り込まれ、同じ名前が 2 回出ないこと
// - 一覧から外したテーマが保存されていても、select が空欄にならず代表を出し、
//   **localStorage の値は書き換わらないこと**
// - 選び直すと stylesheet と CodeMirror のクラスが実際に切り替わること
//
// 単体テストは「一覧の作り方」までしか見られない。ここは実際の DOM を見る。
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-editortheme-result.json')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-editortheme-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'themefolder', name: 'T', color: '#E10051' }],
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
    if(!Array.isArray(l)||!l.length){localStorage.setItem('storages',JSON.stringify([{key:'ts',name:'T',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]));
    // 一覧から外したテーマを「前から選んでいた」状態にする
    localStorage.setItem('config',JSON.stringify({zoom:1,isSideNavFolded:false,listWidth:280,editor:{theme:'material-palenight'},preview:{codeBlockTheme:'twilight'}}));
    setTimeout(()=>location.reload(),50);return false} return true })()`
}

function driver() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const rep = { steps: [] }
    const setValue = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      setter.call(el, v)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const q = sel => Array.from(document.querySelectorAll(sel))
    const findButton = re => q('button').find(b => re.test((b.textContent || '').trim()))
    // UI テーマ側の select にも rockabilly があるので、エディタ側だけが持つ名前で見分ける
    const editorSelect = () => q('select').find(s => Array.from(s.options).some(o => o.value === 'base16-light'))
    const uiSelect = () => q('select').find(s => {
      const v = Array.from(s.options).map(o => o.value)
      return v.indexOf('solarized-dark') !== -1 && v.indexOf('base16-light') === -1
    })
    const openPreferences = async () => {
      const prefBtn = q('button').find(b => {
        const img = b.querySelector('img'); return img && /setting/i.test(img.getAttribute('src') || '')
      })
      if (!prefBtn) throw new Error('preference button not found')
      prefBtn.click(); await sleep(700)
      const uiTab = findButton(/interface|インターフェース/i)
      if (uiTab) { uiTab.click(); await sleep(600) }
    }
    const save = async () => {
      const btn = findButton(/^(save|保存)$/i)
      if (btn) { btn.click(); await sleep(800) }
      return !!btn
    }
    const linkHref = () => {
      const l = document.getElementById('editorTheme')
      return l ? l.getAttribute('href') : null
    }
    const readConfig = () => JSON.parse(localStorage.getItem('config') || '{}')

    try {
      window.__err = []
      window.addEventListener('error', e => window.__err.push(String((e.error && (e.error.stack || e.error.message)) || e.message)))

      for (let i = 0; i < 40; i++) {
        if (!document.getElementById('loadingCover') && document.getElementById('content') && document.getElementById('content').children.length > 0) break
        await sleep(250)
      }
      rep.steps.push('ui-ready')

      await openPreferences()
      let sel = editorSelect()
      if (!sel) return { ok: false, rep, error: 'editor theme select not found' }

      const values = Array.from(sel.options).map(o => o.value)
      rep.optionCount = values.length
      rep.optionValues = values
      rep.duplicated = values.filter((v, i) => values.indexOf(v) !== i)
      rep.optgroups = Array.from(sel.querySelectorAll('optgroup')).map(g => g.label)
      rep.hasAmbianceMobile = values.indexOf('ambiance-mobile') !== -1
      rep.steps.push('options-read')

      // 暗いエディタテーマは明るい UI のままだと coupleEditorTheme に戻されるので
      // UI 側も暗くしてから選ぶ（既存の連動仕様）
      const ui = uiSelect()
      rep.uiSelectFound = !!ui
      if (ui) { setValue(ui, 'rockabilly'); await sleep(400) }

      sel = editorSelect()
      setValue(sel, 'rockabilly'); await sleep(400)
      rep.saveFound = await save()
      rep.hrefAfterRockabilly = linkHref()
      rep.sampleClassAfterRockabilly = (document.querySelector('.CodeMirror') || {}).className || null
      rep.storedAfterRockabilly = (readConfig().editor || {}).theme

      // 見本が実際に色を出しているか。モードが読み込まれていないとトークンが
      // 1 つも作られず、どのテーマでも素の文字色になる（背景だけ変わる）
      // 背後の本文エディタも .CodeMirror なので、必ず select の兄弟から探す。
      // document 全体から取ると別の要素を測って気づけない
      const sample = editorSelect() && editorSelect().parentElement.querySelector('.CodeMirror')
      const colorOf = cls => {
        const el = sample && sample.querySelector('.' + cls)
        return el ? getComputedStyle(el).color : null
      }
      rep.tokenCount = sample ? sample.querySelectorAll('span[class^="cm-"]').length : 0
      rep.tokenClasses = sample ? Array.from(new Set(Array.from(sample.querySelectorAll('span[class^="cm-"]')).map(e => e.className))).slice(0, 20) : []
      rep.sampleText = sample ? (sample.textContent || '').slice(0, 60) : null
      rep.keywordColor = colorOf('cm-keyword')
      rep.stringColor = colorOf('cm-string')
      rep.commentColor = colorOf('cm-comment')
      rep.baseColor = sample ? getComputedStyle(sample).color : null
      rep.steps.push('rockabilly-applied')

      // 一覧から外したテーマが保存されている状態を作る。
      // 設定画面は開くたびに ConfigManager.get() を読み直すので、閉じて開けば足りる
      const legacy = readConfig()
      legacy.editor = Object.assign({}, legacy.editor, { theme: 'material-palenight' })
      localStorage.setItem('config', JSON.stringify(legacy))
      // モーダルを一度閉じて開き直す。UiTab はタブ切替では作り直されないので、
      // 閉じないと state の config が古いまま残る（Esc = keyCode 27 で閉じる）
      const esc = new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
      Object.defineProperty(esc, 'keyCode', { get: () => 27 })
      Object.defineProperty(esc, 'which', { get: () => 27 })
      document.activeElement.dispatchEvent(esc)
      await sleep(600)
      rep.modalClosed = !editorSelect()
      await openPreferences()
      const sel2 = editorSelect()
      // 参考値。select が出す名前は redux の config から来るので、localStorage を
      // 手で書き換えても変わらない。一覧から外したテーマを実際に表示させるには
      // その値を保存した状態でアプリを起動し直す必要があり、ここでは見られない。
      // 代表へ寄せる判定自体は tests/lib/editorThemeCuration.test.js が見ている
      rep.legacySelectValue = sel2 ? sel2.value : null
      rep.legacyStoredAfterOpen = (readConfig().editor || {}).theme
      rep.steps.push('legacy-checked')

      // UI は暗いまま、明るいエディタテーマを選ぶ。
      // 以前はここで保存時に monokai へ書き戻され、選択が効かなかった
      const sel3 = editorSelect()
      if (sel3) { setValue(sel3, 'default'); await sleep(400); await save() }
      rep.hrefAfterDefault = linkHref()
      rep.storedAfterDefault = (readConfig().editor || {}).theme
      rep.uiThemeAtDefault = document.body.getAttribute('data-theme')
      rep.steps.push('default-applied')

      rep.errors = window.__err
      const ok =
        rep.duplicated.length === 0 &&
        rep.hasAmbianceMobile === false &&
        rep.optionCount === 12 &&
        rep.optgroups.length === 2 &&
        rep.storedAfterRockabilly === 'rockabilly' &&
        /rockabilly\\.css$/.test(rep.hrefAfterRockabilly || '') &&
        /cm-s-rockabilly/.test(rep.sampleClassAfterRockabilly || '') &&
        rep.legacyStoredAfterOpen === 'material-palenight' &&
        !rep.hrefAfterDefault &&
        // 暗い UI のまま明るいテーマを選んでも書き戻されない
        rep.storedAfterDefault === 'default' &&
        // 値そのものは原盤側のテストで見ているので、ここは「色が付いていて、
        // 役割ごとに違う色になっている」ことだけを見る
        rep.tokenCount > 0 &&
        !!rep.keywordColor &&
        !!rep.stringColor &&
        !!rep.commentColor &&
        rep.keywordColor !== rep.stringColor &&
        rep.stringColor !== rep.commentColor &&
        rep.keywordColor !== rep.baseColor &&
        rep.errors.length === 0
      return { ok, rep }
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
        finish(r && r.ok ? 0 : 1, r)
      } catch (err) {
        finish(2, { error: 'exec failed: ' + err.message })
      }
    }, 4000)
  })
})

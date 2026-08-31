// 設定 → インターフェースのサブタブ分割とテーマ集約を実機で確認する probe。
//
// 見るのは 4 つ。
//   1. サブタブ（テーマ / 全般 / エディタ / プレビュー）が出て、切り替わること
//   2. テーマのまとまりに 3 つの select と 2 つの見本が揃っていること
//   3. 保存が読む this.refs が、切り替えても全部生きていること
//      （表示の出し分けだけで、中身を外していないことの確認。外すと保存が
//      丸ごと失敗する）
//   4. 保存したコードブロックのテーマが白地のものにならないこと
//
// window は show:false のまま。撮影は capturePage。
// Exit: 0 pass / 1 fail / 2 probe error / 3 watchdog
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const SHOT_DIR = process.env.TB_SHOT_DIR || os.tmpdir()
const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-uisections-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-uisec-'))
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
const consoleLogs = []
let finished = false
let ran = false

function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail })
}

function finish(code, result) {
  if (finished) return
  finished = true
  // stdout はパイプ越しだとバッファされ、強制終了で消える。結果はファイルにも書く
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, checks, result, consoleLogs }, null, 2)
    )
  } catch (e) {
    /* 書けなくても probe は続ける */
  }
  console.log('\n=== ui-sections probe ===')
  checks.forEach(c => {
    console.log(
      `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${
        c.detail === undefined ? '' : `  — ${JSON.stringify(c.detail)}`
      }`
    )
  })
  console.log(`exit ${code}`)
  setTimeout(() => app.exit(code), 300)
}

setTimeout(() => finish(3, { error: 'watchdog' }), 80000)

// 例外の収集は did-finish-load の直後に仕掛ける。driver() の中で登録すると、
// 起動中や seed 後のリロード中に出た例外を取りこぼす
function installErrorCollector() {
  return `(() => {
    if (window.__probeErrors) return true
    window.__probeErrors = []
    window.addEventListener('error', e => {
      window.__probeErrors.push(String((e.error && (e.error.stack || e.error.message)) || e.message))
    })
    window.addEventListener('unhandledrejection', e => {
      const r = e.reason
      window.__probeErrors.push('unhandledrejection: ' + String((r && (r.stack || r.message)) || r))
    })
    return true
  })()`
}

function seed() {
  return `(() => { let l=[]; try{l=JSON.parse(localStorage.getItem('storages'))||[]}catch(e){}
    if(!Array.isArray(l)||!l.length){
      localStorage.setItem('storages',JSON.stringify([{key:'ts',name:'T',type:'FILESYSTEM',path:${JSON.stringify(
        storageDir
      )}}]));
      // ダーク UI + 既定のままのコードブロックテーマ。移行が効けば default では無くなる
      localStorage.setItem('config',JSON.stringify({zoom:1,isSideNavFolded:false,listWidth:280,
        ui:{theme:'rockabilly',defaultTheme:'rockabilly'},
        editor:{theme:'monokai'},preview:{codeBlockTheme:'default'}}));
      setTimeout(()=>location.reload(),50);return false} return true })()`
}

function driver() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const q = s => Array.from(document.querySelectorAll(s))
    // 背後の本体にも select と .CodeMirror があるので、必ずモーダルの中だけを見る。
    // document 全体から数えると、隠れたかどうかの判定が常に false になる
    const modal = () => document.querySelector('.ModalBase') || document
    const qm = s => Array.from(modal().querySelectorAll(s))
    const rep = { steps: [], errors: [] }
    try {
      // installErrorCollector() が仕掛けた分を引き継ぐ
      rep.errors = (window.__probeErrors || []).slice()
      for (let i = 0; i < 40; i++) {
        if (!document.getElementById('loadingCover') && document.getElementById('content') && document.getElementById('content').children.length > 0) break
        await sleep(250)
      }
      rep.steps.push('ui-ready')

      const prefBtn = q('button').find(b => { const i = b.querySelector('img'); return i && /setting/i.test(i.getAttribute('src')||'') })
      if (!prefBtn) throw new Error('preference button not found')
      prefBtn.click(); await sleep(900)
      const uiTab = q('button').find(b => /interface|インターフェース/i.test((b.textContent||'').trim()))
      if (!uiTab) throw new Error('interface tab not found')
      uiTab.click(); await sleep(900)
      rep.steps.push('prefs-open')

      // ダークテーマで測る。localStorage を先に書いておく方法は、起動直後に
      // アプリ自身が config を書き直すので当てにならない。画面から選ぶ
      const setValue = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
        setter.call(el, v)
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      const uiThemeSelect = qm('select').find(sel => {
        const v = Array.from(sel.options).map(o => o.value)
        return v.indexOf('solarized-dark') !== -1 && v.indexOf('base16-light') === -1
      })
      rep.uiThemeSelectFound = !!uiThemeSelect
      if (uiThemeSelect) { setValue(uiThemeSelect, 'rockabilly'); await sleep(500) }
      rep.bodyTheme = document.body.getAttribute('data-theme')

      const nav = () => q('[role="tablist"] button')
      rep.navButtons = nav().map(b => (b.textContent||'').trim())

      const visible = sel => qm(sel).filter(e => e.offsetParent !== null)
      const themeSelects = visible('select')
      rep.themeSelectCount = themeSelects.length
      rep.themeSamples = visible('.CodeMirror').length
      rep.steps.push('theme-read')

      // 見本に色が付いているか（モードが読み込まれていないとトークンが作られない）
      rep.sampleTokenCounts = visible('.CodeMirror').map(el => el.querySelectorAll('span[class^="cm-"]').length)

      const editorNav = nav().find(b => /^(editor|エディタ)$/i.test((b.textContent||'').trim()))
      if (!editorNav) throw new Error('editor sub-tab not found')
      editorNav.click(); await sleep(600)
      rep.themeHiddenAfterSwitch = themeSelects.every(s => s.offsetParent === null)
      rep.steps.push('switched-editor')

      // 隠れていた側の CodeMirror が測り直されているか（幅 0 のままなら失敗）
      const previewNav = nav().find(b => /^(preview|プレビュー)$/i.test((b.textContent||'').trim()))
      if (previewNav) { previewNav.click(); await sleep(700) }
      rep.previewCmWidths = visible('.CodeMirror').map(el => el.getBoundingClientRect().width)
      rep.steps.push('switched-preview')

      // 保存が読む ref が生きているか
      const inst = (() => {
        let n = q('[role="tablist"]')[0]
        while (n) {
          const key = Object.keys(n).find(k => k.startsWith('__reactInternalInstance'))
          if (key) {
            let fiber = n[key]
            while (fiber) {
              if (fiber.stateNode && fiber.stateNode.refs && fiber.stateNode.refs.uiTheme) return fiber.stateNode
              fiber = fiber.return
            }
          }
          n = n.parentElement
        }
        return null
      })()
      rep.instanceFound = !!inst
      if (inst) {
        const needed = ['uiTheme','uiLanguage','defaultNote','editorTheme','editorFontSize','previewFontSize','previewCodeBlockTheme','previewTocMinLevel','spellcheck','rtlEnabled']
        rep.missingRefs = needed.filter(k => !inst.refs[k])
      }

      const save = q('button').find(b => /^(save|保存)$/i.test((b.textContent||'').trim()))
      rep.saveFound = !!save
      if (save) { save.click(); await sleep(900) }
      rep.savedCodeBlockTheme = (JSON.parse(localStorage.getItem('config')||'{}').preview||{}).codeBlockTheme
      rep.steps.push('saved')

      return { ok: rep.errors.length === 0, rep }
    } catch (err) {
      rep.errors.push(String((err && (err.stack || err.message)) || err))
      return { ok: false, rep }
    }
  })()`
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (_ev, level, message) =>
    consoleLogs.push({ level, message: String(message).slice(0, 300) })
  )
  wc.on('did-finish-load', () => {
    wc.executeJavaScript(installErrorCollector(), true).catch(() => {})
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true
        const r = await wc.executeJavaScript(driver(), true)
        const rep = (r && r.rep) || {}

        const png = await wc.capturePage()
        fs.writeFileSync(path.join(SHOT_DIR, 'ui-sections.png'), png.toPNG())

        check(
          'サブタブが 4 つ出る',
          (rep.navButtons || []).length === 4,
          rep.navButtons
        )
        check(
          'テーマのまとまりに select が 3 つ',
          rep.themeSelectCount === 3,
          rep.themeSelectCount
        )
        check(
          'テーマの見本が 2 つ出る',
          rep.themeSamples >= 2,
          rep.themeSamples
        )
        check(
          '見本に色が付いている（モードが読み込まれている）',
          (rep.sampleTokenCounts || []).every(n => n > 0),
          rep.sampleTokenCounts
        )
        check('切り替えでテーマ側が隠れる', rep.themeHiddenAfterSwitch === true)
        check(
          '隠れていた側の CodeMirror が測り直されている',
          (rep.previewCmWidths || []).length > 0 &&
            rep.previewCmWidths.every(w => w > 0),
          rep.previewCmWidths
        )
        check(
          '保存が読む ref が全部生きている',
          rep.instanceFound && (rep.missingRefs || []).length === 0,
          rep.missingRefs
        )
        check('保存ボタンがある', rep.saveFound === true)
        check(
          '保存したコードブロックのテーマが暗いもののまま',
          !!rep.savedCodeBlockTheme && rep.savedCodeBlockTheme !== 'default',
          rep.savedCodeBlockTheme
        )
        check(
          'ダークテーマに切り替わっている',
          rep.bodyTheme === 'rockabilly',
          rep.bodyTheme
        )
        // console 側のエラーも失敗にする。ただし常に出るものは除く。
        // - React の非推奨警告と Electron の CSP 警告
        // - 空のプロファイルで起動するため出るもの（キャッシュ無し・
        //   storage 登録前の boostnote.json 探索）。probe の作り方に由来する
        //   もので、変更の良し悪しとは関係しない
        const IGNORED = [
          /^Warning:/,
          /Electron Security Warning/,
          /Failed to parse cached data from localStorage/,
          /boostnote\.json file doesn't exist/,
          /notes\s+doesn't exist\./,
          /The vm module of Node\.js is deprecated/
        ]
        const consoleErrors = consoleLogs
          .filter(l => l.level >= 2)
          .filter(l => !IGNORED.some(re => re.test(l.message)))
        check(
          'renderer の console にエラーが出ていない',
          consoleErrors.length === 0,
          consoleErrors.map(l => l.message.slice(0, 120))
        )
        check(
          'renderer で例外が出ていない',
          (rep.errors || []).length === 0,
          rep.errors
        )
        finish(checks.every(c => c.pass) ? 0 : 1, rep)
      } catch (err) {
        finish(2, { error: 'exec failed: ' + err.message })
      }
    }, 4000)
  })
})

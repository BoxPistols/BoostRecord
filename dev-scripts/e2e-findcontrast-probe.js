// 検索ハイライトの上の文字が読めるかを、実ブラウザの computed style で測る probe。
//
// 蛍光ペン(#ffeb3b)の下に構文色がそのまま残ると、黄色系のトークン
// (base16-light の文字列 #f4bf75 等)が背景に溶けて**文字が消える**。
// CSS 側は color を指定しているのに、CodeMirror テーマの
// `.cm-s-<theme> span.cm-string` の方が詳細度で勝つと効かない。
// ソースを読んでも分からないので、必ず実測する。
//
// 半透明の背景は祖先と合成してから測る（不透明として測ると数字が嘘になる）。
//
// Exit: 0 全部 4.5:1 以上 / 1 割れている / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  parseCssColor,
  compositeOver,
  contrastRatio
} = require('./contrast-util')

// 本文なので WCAG 2.1 の 1.4.3 = 4.5:1
const REPO_ROOT = path.join(__dirname, '..')
const MIN_RATIO = 4.5

// 既定(base16-light)と、黄色系トークンを持つ暗テーマを混ぜる。
// 1テーマだけ見て「大丈夫」と言わない
// 'solarized' はアプリ側で 'solarized dark' / 'solarized light' の2エントリに
// 分けられており、単体のファイル名としては存在しない。測れないものを
// 一覧に入れると「測定不能」で落ちるだけなので、実在するテーマを並べる
const THEMES = [
  'base16-light',
  'monokai',
  'default',
  'dracula',
  'base16-dark',
  'theboosters-dark'
]

const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-findcontrast-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-findcontrast-'))
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
  console.log('\n=== find highlight contrast probe ===')
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
    if (localStorage.getItem('__findContrastSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__findContrastSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

/**
 * 一番外側の不透明な層から内側へ重ねて、実際に描かれている背景を出す。
 * 不透明な層がひとつも無いなら測れない → null を返して落とす(fail-closed)
 */
function effectiveBackground(layers) {
  let base = null
  for (let i = layers.length - 1; i >= 0; i--) {
    const color = parseCssColor(layers[i])
    if (!color) continue
    if (base === null) {
      if (color.a >= 1) base = color
      continue
    }
    base = compositeOver(color, base)
  }
  return base
}

// ハイライトされた span の実際の色を集める。祖先の背景も一緒に返して
// node 側で合成する（ページ内で計算すると検算できない）
const MEASURE = `(() => {
  const spans = Array.from(document.querySelectorAll('.CodeMirror .tb-find-all'))
  return spans.map(el => {
    const layers = []
    let node = el
    for (let i = 0; i < 20 && node && node.nodeType === 1; i++) {
      layers.push(getComputedStyle(node).backgroundColor)
      node = node.parentElement
    }
    return {
      text: el.textContent,
      tokenClass: String(el.className || ''),
      color: getComputedStyle(el).color,
      layers
    }
  })
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

        // 構文色が付く内容を入れる。文字列トークンとコメントトークンの
        // 両方に一致させる（黄色系はこの2つに割り当てられがち）
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
             cm.CodeMirror.setValue("# log の設定\\nalias lg='git log'\\nalias day='git log --oneline'\\n")
             // アプリの setMode と同じ手順で読み込む。mode 文字列を
             // setOption するだけでは**モード本体が無いので色が付かない**
             const CM = window.CodeMirror
             const syntax = CM.findModeByName('Shell')
             if (!syntax) return { ok:false, step:'no Shell mode meta' }
             cm.CodeMirror.setOption('mode', syntax.mime)
             CM.autoLoadMode(cm.CodeMirror, syntax.mode)
             // モードの読み込みは非同期。トークンが付くまで待つ
             let tokens = 0
             for (let i=0;i<40;i++){
               tokens = document.querySelectorAll('.CodeMirror span[class*="cm-"]').length
               if (tokens > 0) break
               await sleep(250)
             }
             return { ok: tokens > 0, step: tokens ? '' : 'トークンが付かない', tokens }
           })()`,
          true
        )
        rows.push({ label: 'スニペットを用意', data: made })
        if (!made.ok) return finish(2, { error: 'setup: ' + made.step })

        const SUPER = process.platform === 'darwin' ? 'cmd' : 'control'
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'F', modifiers: [SUPER] })
        wc.sendInputEvent({ type: 'keyUp', keyCode: 'F', modifiers: [SUPER] })
        await new Promise(resolve => setTimeout(resolve, 600))

        const typed = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             const el = document.querySelector('.FindBar input')
             if (!el) return { ok:false }
             const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
             setter.call(el, 'log')
             el.dispatchEvent(new Event('input', { bubbles: true }))
             await sleep(500)
             return { ok:true, marks: document.querySelectorAll('.tb-find-all').length }
           })()`,
          true
        )
        rows.push({ label: '検索する', data: typed })
        if (!typed.ok || !typed.marks) {
          return finish(2, { error: 'ハイライトが出ない' })
        }

        for (const theme of THEMES) {
          // **CSS も読ませる。** setOption だけではクラス名が変わるだけで、
          // テーマの CSS が無ければ構文色も背景も付かない。それに気づかず
          // 測ると「どのテーマでも安全」という嘘の結果になる
          const cssPath = [
            path.join(
              REPO_ROOT,
              'extra_scripts',
              'codemirror',
              'theme',
              `${theme}.css`
            ),
            path.join(
              REPO_ROOT,
              'node_modules',
              'codemirror',
              'theme',
              `${theme}.css`
            )
          ].find(candidate => fs.existsSync(candidate))
          const switched = await wc.executeJavaScript(
            `(async () => {
               const sleep = ms => new Promise(r => setTimeout(r, ms))
               const link = document.getElementById('editorTheme')
               if (link && ${JSON.stringify(!!cssPath)}) {
                 link.setAttribute('href', ${JSON.stringify(
                   'file://' + (cssPath || '')
                 )})
               }
               const cm = document.querySelector('.CodeMirror')
               cm.CodeMirror.setOption('theme', ${JSON.stringify(theme)})
               for (let i = 0; i < 40; i++) {
                 await sleep(100)
                 const bg = getComputedStyle(cm).backgroundColor
                 if (bg && bg !== 'rgba(0, 0, 0, 0)') break
               }
               await sleep(300)
               return { rootBg: getComputedStyle(cm).backgroundColor }
             })()`,
            true
          )
          const rootBg = parseCssColor(switched.rootBg)
          const isDarkTheme = /dark|monokai|dracula|solarized/.test(theme)
          if (
            isDarkTheme &&
            !(rootBg && rootBg.r + rootBg.g + rootBg.b < 384)
          ) {
            rows.push({
              label: `${theme}: テーマが効いていない（測定不能）`,
              verdict: 'FAIL',
              data: switched
            })
            continue
          }
          const measured = await wc.executeJavaScript(MEASURE, true)
          if (!measured.length) {
            rows.push({
              label: `${theme}: 測れなかった`,
              verdict: 'FAIL',
              data: { spans: 0 }
            })
            continue
          }
          measured.forEach(span => {
            const bg = effectiveBackground(span.layers)
            const fg = parseCssColor(span.color)
            if (!bg || !fg) {
              rows.push({
                label: `${theme}: 色が読めない`,
                verdict: 'FAIL',
                data: span
              })
              return
            }
            const ratio = contrastRatio(fg, bg)
            rows.push({
              label: `${theme} / ${span.tokenClass
                .replace('tb-find-all', '')
                .trim() || 'no-token'} / "${span.text}"`,
              verdict: ratio >= MIN_RATIO ? 'PASS' : 'FAIL',
              data: {
                ratio: Math.round(ratio * 100) / 100,
                color: span.color,
                bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(
                  bg.b
                )})`
              }
            })
          })
        }

        // **構文色の付いた一致を1件も測れていないなら、この probe は
        // 何も検証していない。** 緑にしてはいけない
        const tokenRows = rows.filter(r => r.verdict && /cm-/.test(r.label))
          .length
        rows.push({
          label: '構文色の付いた一致を測れている',
          verdict: tokenRows > 0 ? 'PASS' : 'FAIL',
          data: { tokenRows }
        })

        const img = await win.webContents.capturePage()
        const shot = path.join(
          process.env.TB_SHOT_DIR || os.tmpdir(),
          'find-contrast.png'
        )
        fs.writeFileSync(shot, img.toPNG())
        rows.push({ label: 'SHOT', data: shot })

        const failed = rows.filter(r => r.verdict === 'FAIL').length
        finish(failed > 0 ? 1 : 0, { minRatio: MIN_RATIO })
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

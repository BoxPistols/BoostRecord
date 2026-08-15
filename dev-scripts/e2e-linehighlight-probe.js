// 行ハイライト（行番号クリック）が、どのテーマでも読める色になっているかを
// 実ブラウザの computed style で測る probe。
//
// このクラス(CodeMirror-activeline-background)はアクティブ行の表示と共用で、
// CodeMirror の既定色は不透明の淡い青(#e8f2ff)。暗テーマに当てると白飛びして
// 文字が消える（利用者からの報告：表の行が白帯になって読めない）。
//
// 背景だけ差し替えても、文字色はテーマ側が残る。**合成後の背景**に対して
// 実際の文字色で比を取らないと、直ったつもりで直っていない。
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

const root = path.join(__dirname, '..')
const MIN_RATIO = 4.5
const THEMES = [
  'theboosters-dark',
  'theboosters-light',
  'base16-light',
  'monokai',
  'dracula'
]

const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-linehighlight-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-linehighlight-'))
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

// 報告と同じ形。表と、太字を含む行
const NOTE = [
  '| 定義の所在 | 種類数 |',
  '| --- | --- |',
  '| 共有 CSS | **295** |',
  '| ページ内 style | **3,536** |',
  '| どこにも定義が無い | 363 |'
].join('\n')

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
  console.log('\n=== line highlight contrast probe ===')
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
    if (localStorage.getItem('__lineHlSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__lineHlSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

/** 一番外側の不透明な層から内側へ重ねて、実際に描かれている背景を出す */
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

// ハイライトされた行の中の文字を1つずつ測る。**行全体の平均では見えない**
const MEASURE = `(() => {
  const marked = Array.from(
    document.querySelectorAll('.CodeMirror .CodeMirror-activeline-background')
  )
  const out = []
  marked.forEach(line => {
    const spans = Array.from(line.querySelectorAll('span'))
      .filter(el => (el.textContent || '').trim().length > 0)
    const targets = spans.length ? spans : [line]
    targets.forEach(el => {
      const layers = []
      let node = el
      for (let i = 0; i < 20 && node && node.nodeType === 1; i++) {
        layers.push(getComputedStyle(node).backgroundColor)
        node = node.parentElement
      }
      // 犯人を名指しするために、色を出している要素の素性も返す
      const chain = []
      let n = el
      for (let i = 0; i < 6 && n && n.nodeType === 1; i++) {
        const cs = getComputedStyle(n)
        chain.push({
          tag: n.tagName,
          cls: String(n.className || '').slice(0, 60),
          bg: cs.backgroundColor,
          color: cs.color
        })
        n = n.parentElement
      }
      out.push({
        text: (el.textContent || '').trim().slice(0, 14),
        color: getComputedStyle(el).color,
        layers,
        chain
      })
    })
  })
  return out
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

        const made = await wc.executeJavaScript(
          `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
             const b = document.querySelector('.NewNoteButton button')
             if (!b) return { ok:false, step:'no NewNoteButton' }
             b.click(); await sleep(700)
             const modal = document.querySelector('.ModalBase') || document
             const md = Array.from(modal.querySelectorAll('button'))
               .find(x => /markdown|マークダウン/i.test(x.textContent))
             if (!md) return { ok:false, step:'no markdown button' }
             md.click()
             let cm = null
             for (let i=0;i<40;i++){
               cm = document.querySelector('.CodeMirror')
               if (cm && cm.CodeMirror && cm.CodeMirror.getValue() === '') break
               cm = null; await sleep(250)
             }
             if (!cm) return { ok:false, step:'no empty editor' }
             cm.CodeMirror.setValue(${JSON.stringify(NOTE)})
             await sleep(800)
             // 行番号クリックと同じ経路で 3 行目をハイライトする
             const editor = cm.CodeMirror
             editor.options.linesHighlighted = editor.options.linesHighlighted || []
             CodeMirror.signal(editor, 'gutterClick', editor, 2)
             await sleep(500)
             // activeline-background はアクティブ行と共用なので個数では
             // 判定できない。ハンドラが通った証拠は linesHighlighted で取る
             return {
               ok: editor.options.linesHighlighted.includes(2),
               highlighted: document.querySelectorAll('.CodeMirror-activeline-background').length
             }
           })()`,
          true
        )
        rows.push({ label: '行ハイライトを付ける', data: made })
        if (!made.ok) {
          return finish(2, {
            error: 'ハイライトが付かない: ' + (made.step || '')
          })
        }

        for (const theme of THEMES) {
          // **CSS も読ませる。** setOption だけではクラス名が変わるだけで、
          // テーマの CSS が無ければ背景は白のまま。それに気づかず測ると
          // 「暗テーマでも安全」という嘘の結果になる（実際に一度出した）
          const cssPath = [
            path.join(
              root,
              'extra_scripts',
              'codemirror',
              'theme',
              `${theme}.css`
            ),
            path.join(
              root,
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
               document.querySelector('.CodeMirror').CodeMirror.setOption('theme', ${JSON.stringify(
                 theme
               )})
               // stylesheet の読み込みを待つ
               for (let i = 0; i < 40; i++) {
                 await sleep(100)
                 const bg = getComputedStyle(document.querySelector('.CodeMirror')).backgroundColor
                 if (bg && bg !== 'rgba(0, 0, 0, 0)') break
               }
               await sleep(300)
               return {
                 rootBg: getComputedStyle(document.querySelector('.CodeMirror')).backgroundColor,
                 hasCss: !!link
               }
             })()`,
            true
          )
          // テーマが効いているか（暗テーマなら背景が暗い）を先に確かめる
          const rootBg = parseCssColor(switched.rootBg)
          const isDarkTheme = /dark|monokai|dracula/.test(theme)
          const rootIsDark = rootBg && rootBg.r + rootBg.g + rootBg.b < 384
          if (isDarkTheme && !rootIsDark) {
            check(`${theme}: テーマが効いていない（測定不能）`, false, switched)
            continue
          }
          const measured = await wc.executeJavaScript(MEASURE, true)
          if (!measured.length) {
            check(`${theme}: 測れなかった`, false, { spans: 0 })
            continue
          }
          let worst = null
          measured.forEach(item => {
            const bg = effectiveBackground(item.layers)
            const fg = parseCssColor(item.color)
            if (!bg || !fg) return
            const ratio = contrastRatio(fg, bg)
            if (worst === null || ratio < worst.ratio) {
              worst = {
                ratio: Math.round(ratio * 100) / 100,
                text: item.text,
                color: item.color,
                chain: item.chain,
                bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(
                  bg.b
                )})`
              }
            }
          })
          check(
            `${theme}: ハイライト行の文字が ${MIN_RATIO}:1 以上`,
            worst != null && worst.ratio >= MIN_RATIO,
            worst
          )
        }

        const shot = path.join(
          process.env.TB_SHOT_DIR || os.tmpdir(),
          'line-highlight.png'
        )
        fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG())
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

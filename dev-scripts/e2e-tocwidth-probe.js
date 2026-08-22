// 目次ペインが本文（プレビュー/エディタ）を必要以上に圧迫しないかを
// 実レイアウトで測る probe。
//
// 実機で観測された不具合（config に tocWidth:480 が永続化されていた）:
//   1. 目次の箱は 480px を本文から奪うのに、TocPane 本体は styl の
//      `flex 0 0 200px` で 200px 固定 → 280px が「何も描かれない死に領域」
//   2. 480px という絶対値はペイン幅と無関係。狭いウィンドウでは本文が
//      1/3 まで潰れる（ウィンドウを縮めても追従しない）
//
// 測ること（ユーザー実機と同じ 1185px 幅、および縮めた 900px で）:
//   A. 目次の箱が .body の TOC_MAX_RATIO を超えない
//   B. TocPane 本体が箱いっぱいに描かれる（死に領域が無い）
//   C. 本文側に十分な幅が残る
//
// Exit: 0 PASS / 1 FAIL / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-tocwidth-result.json')

// 実装と揃える（lib 側の定数を renderer から読めないので probe 側にも持つ）
const TOC_MAX_RATIO = 0.4
// 実機で永続化されていた値。これを起点に「上限で頭打ちになる」ことを見る
const STORED_TOC_WIDTH = 480

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-tocwidth-'))
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
  console.log('\n=== toc width probe ===')
  rows.forEach(r => console.log(`ROW   ${r.label} — ${JSON.stringify(r.data)}`))
  if (result && result.verdict) console.log(`\nVERDICT: ${result.verdict}`)
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
    if (localStorage.getItem('__tocWidthSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    // ConfigManager.get() は DEFAULT_CONFIG と1段マージするので部分指定でよい
    const c = JSON.parse(localStorage.getItem('config') || '{}')
    c.preview = Object.assign({}, c.preview, {
      showToc: true,
      tocWidth: ${STORED_TOC_WIDTH}
    })
    localStorage.setItem('config', JSON.stringify(c))
    localStorage.setItem('__tocWidthSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

// TocPane は安定した plain class（.TocPane）を持つので、CSS Modules の
// ハッシュ名に依存せず親子を辿れる
const MEASURE = `(() => {
  const pane = document.querySelector('.TocPane')
  if (!pane) return { ok: false, step: 'no .TocPane' }
  const box = pane.parentElement
  const body = box && box.parentElement
  if (!body) return { ok: false, step: 'no body ancestor' }
  const main = Array.from(body.children).find(el => el !== box)
  if (!main) return { ok: false, step: 'no main pane' }
  const w = el => Math.round(el.getBoundingClientRect().width)
  return {
    ok: true,
    bodyW: w(body),
    boxW: w(box),
    paneW: w(pane),
    mainW: w(main)
  }
})()`

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true

        await wc.executeJavaScript(
          `(async () => { const s = ms => new Promise(r => setTimeout(r, ms))
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await s(250) }
             return true })()`,
          true
        )

        const win = BrowserWindow.getAllWindows()[0]
        // ユーザー実機と同じウィンドウ幅（config.json の windowsize 実測値）
        if (win) win.setSize(1185, 1019)
        await sleep(500)

        const made = await wc.executeJavaScript(
          `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
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
             cm.CodeMirror.setValue('# Zsh M2Pro\\n\\n## section\\n\\nbody text\\n')
             await sleep(1200)
             return { ok:true }
           })()`,
          true
        )
        rows.push({ label: 'note created', data: made })
        if (!made.ok) return finish(2, { error: 'setup: ' + made.step })

        const problems = []
        const check = async (label, width) => {
          if (win) win.setSize(width, 1019)
          await sleep(700)
          const m = await wc.executeJavaScript(MEASURE, true)
          rows.push({ label: `${label} (win=${width})`, data: m })
          if (!m.ok) {
            problems.push(`${label}: 測れない (${m.step})`)
            return
          }
          const cap = Math.round(m.bodyW * TOC_MAX_RATIO)
          // A. 箱がペインの上限比率を超えない
          if (m.boxW > cap + 1) {
            problems.push(
              `${label}: 目次の箱 ${m.boxW}px が上限 ${cap}px(=body ${
                m.bodyW
              }px の${TOC_MAX_RATIO * 100}%)を超過`
            )
          }
          // B. 箱の中に死に領域が無い（TocPane が箱いっぱい）
          if (Math.abs(m.boxW - m.paneW) > 2) {
            problems.push(
              `${label}: 箱 ${m.boxW}px に対し TocPane ${
                m.paneW
              }px（差 ${m.boxW - m.paneW}px の死に領域）`
            )
          }
          // C. 本文側が十分残る
          if (m.mainW < m.bodyW * 0.55) {
            problems.push(
              `${label}: 本文 ${m.mainW}px が body ${m.bodyW}px の55%未満`
            )
          }
        }

        await check('実機同幅', 1185)
        // ウィンドウを縮めても追従するか（絶対値のままなら比率が破綻する）
        await check('縮小後', 900)

        // D. FindBar が目次に潜り込まないか。right/max-width は入れ子の
        //    calc(min(...)) で組んでいるので、CSS として解決できていないと
        //    黙って無視され（例外は出ない）検索欄が目次の下に隠れる
        if (win) win.setSize(1185, 1019)
        await sleep(500)
        wc.send('detail:find')
        await sleep(800)
        const bar = await wc.executeJavaScript(
          `(() => {
             const el = document.querySelector('.FindBar')
             if (!el) return { ok: false, step: 'no .FindBar' }
             const pane = document.querySelector('.TocPane')
             const box = pane && pane.parentElement
             const cs = getComputedStyle(el)
             return {
               ok: true,
               barRight: Math.round(el.getBoundingClientRect().right),
               tocLeft: box ? Math.round(box.getBoundingClientRect().left) : null,
               barLeft: Math.round(el.getBoundingClientRect().left),
               maxWidth: cs.maxWidth
             }
           })()`,
          true
        )
        rows.push({ label: 'FindBar 位置', data: bar })
        if (!bar.ok) {
          problems.push('FindBar: 測れない (' + bar.step + ')')
        } else {
          if (bar.tocLeft != null && bar.barRight > bar.tocLeft + 1) {
            problems.push(
              `FindBar 右端 ${bar.barRight}px が目次の左端 ${bar.tocLeft}px に潜り込む`
            )
          }
          // max-width に % を含む calc は、getComputedStyle が計算前の式を
          // 返すのが正常（px には解決されない）。CSS として無効なら宣言ごと
          // 捨てられて 'none' になるので、そこだけを見る
          if (bar.maxWidth === 'none') {
            problems.push('FindBar の max-width が無効な calc で捨てられている')
          }
          if (bar.barLeft < 0) {
            problems.push(`FindBar の左端が画面外 (${bar.barLeft}px)`)
          }
        }

        if (win) {
          const img = await win.webContents.capturePage()
          const shot = path.join(
            process.env.TB_SHOT_DIR || os.tmpdir(),
            'tocwidth.png'
          )
          fs.writeFileSync(shot, img.toPNG())
          rows.push({ label: 'SHOT', data: shot })
        }

        const verdict =
          problems.length === 0
            ? 'PASS: 目次は本文を圧迫せず、箱いっぱいに描画され、幅変更にも追従する'
            : 'FAIL: ' + problems.join(' / ')
        finish(problems.length === 0 ? 0 : 1, { verdict })
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

// 環境設定（インターフェース）の見た目と動きを実機で測る probe。
//
// 目的は2つ。
//   1. 散らばっていたテーマ設定（インターフェース／エディタ／コードブロック）が
//      1か所に並んでいること
//   2. 目的から選ぶプリセットが、押した時点で実際に設定へ反映されること
//
// 「ビルドが通る」ことと「正しく描かれる」ことは別なので、必ず実描画で測る。
//
// Exit: 0 全部 PASS / 1 FAIL あり / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  parseCssColor,
  compositeOver,
  contrastRatio
} = require('./contrast-util')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-prefs-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-prefs-'))
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
  console.log('\n=== preferences probe ===')
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
    if (localStorage.getItem('__prefsSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__prefsSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

// 設定画面の構造を読む。セレクトの並び順と、テーマ関連が固まっているかを見る
const PREFS_STATE = `(() => {
  const modal = document.querySelector('[class*="ConfigTab"], .ModalBase') || document
  const labels = Array.from(modal.querySelectorAll('[class*="group-section-label"]'))
    .map(el => (el.textContent || '').trim())
  // **日本語決め打ちにしない。** 英語ロケールでは1つも見つからず、
  // 「設定が離れている」ではなく「測れていない」で落ちる
  const themeLabels = [
    ['インターフェーステーマ', 'Interface Theme'],
    ['エディタのテーマ', 'Editor Theme'],
    ['コードブロックのテーマ', 'Code Block Theme']
  ]
  const indexes = themeLabels.map(names =>
    labels.findIndex(label => names.indexOf(label) !== -1)
  )
  const presets = Array.from(modal.querySelectorAll('[class*="preset"]'))
    .filter(el => el.tagName === 'BUTTON')
  // **インターフェーステーマのセレクトも optgroup を持つ**ので、
  // 「optgroup がある最初の select」では取り違える。
  // エディタテーマは自前テーマを選択肢に含む方
  const editorSelect = Array.from(modal.querySelectorAll('select')).find(sel =>
    Array.from(sel.querySelectorAll('option')).some(o =>
      /^theboosters-/.test(o.value)
    )
  )
  return {
    labels: labels.slice(0, 12),
    themeLabelIndexes: indexes,
    // 詳細オプションは既定で畳まれていること（開いていたら整理になっていない）
    accordions: Array.from(modal.querySelectorAll('details')).map(d => ({
      label: (d.querySelector('summary') || {}).textContent || '',
      open: d.open,
      sections: d.querySelectorAll('[class*="group-section"]').length
    })),
    presetCount: presets.length,
    presetLabels: presets.map(b => (b.textContent || '').trim().slice(0, 24)),
    optgroups: editorSelect
      ? Array.from(editorSelect.querySelectorAll('optgroup')).map(g => g.label)
      : [],
    firstRecommended: editorSelect
      ? Array.from(
          editorSelect.querySelectorAll('optgroup')
        )[0].querySelector('option').value
      : null,
    config: JSON.parse(localStorage.getItem('config') || '{}')
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

        const opened = await wc.executeJavaScript(
          `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
             const btn = document.querySelector('[class*="top-menu-preference"]')
             if (!btn) return { ok:false, step:'no preference button' }
             btn.click()
             await sleep(900)
             // 既定タブはストレージ。インターフェースへ切り替える
             // タブは <button><span>ラベル</span></button>。span で絞ると
             // ボタンに当たらず、ボタンだけ見ると子要素で弾かれる
             const tab = Array.from(document.querySelectorAll('button'))
               .find(el => /^(インターフェース|Interface)$/.test((el.textContent || '').trim()))
             if (!tab) return { ok:false, step:'no interface tab' }
             tab.click()
             for (let i=0;i<40;i++){
               if (document.querySelector('[class*="group-section-label"]')) break
               await sleep(250)
             }
             await sleep(1200)
             return {
               ok: !!document.querySelector('[class*="group-section-label"]'),
               // 開けなかった時の切り分け
               modals: document.querySelectorAll('[class*="ModalBase"], [class*="modal"]').length,
               tabs: Array.from(document.querySelectorAll('button, [role="tab"]'))
                 .map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 15),
               bodyClasses: String(document.body.className).slice(0, 80)
             }
           })()`,
          true
        )
        rows.push({ label: '設定を開く', data: opened })
        if (!opened.ok) return finish(2, { error: '設定が開けない' })

        const state = await wc.executeJavaScript(PREFS_STATE, true)

        check(
          'テーマ設定が3つとも見つかる（測れている証拠）',
          state.themeLabelIndexes.every(i => i >= 0),
          { indexes: state.themeLabelIndexes, labels: state.labels }
        )
        // 散らばっていると、この差が大きくなる（元は 1 / 12 / 40 番目だった）
        const spread =
          Math.max.apply(null, state.themeLabelIndexes) -
          Math.min.apply(null, state.themeLabelIndexes)
        check('テーマ設定が隣り合っている（間隔3以内）', spread <= 3, {
          spread,
          indexes: state.themeLabelIndexes
        })

        // 詳細オプションが畳まれていること。開きっぱなしなら整理になっていない
        check(
          '詳細オプションが2つあり、既定で畳まれている',
          state.accordions.length === 2 &&
            state.accordions.every(a => a.open === false) &&
            state.accordions.every(a => a.sections >= 3),
          state.accordions
        )
        check(
          'プリセットが4つ出る',
          state.presetCount === 4,
          state.presetLabels
        )
        // 既定は「推奨」だけ。54件を一度に並べない（利用者からの指摘）
        check(
          '既定では推奨だけを出す',
          state.optgroups.length === 1 &&
            /推奨|Recommended/.test(state.optgroups[0]),
          state.optgroups
        )
        check(
          '推奨の先頭は自前テーマ',
          /^theboosters-/.test(state.firstRecommended || ''),
          state.firstRecommended
        )

        // 「すべて表示」を押すと残りが出る（隠して終わりにしない）
        const expanded = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
             const toggle = boxes.find(b => {
               const label = b.closest('label')
               return label && /すべてのテーマ|Show all themes/.test(label.textContent || '')
             })
             if (!toggle) return { ok:false }
             toggle.click(); await sleep(400)
             const sel = Array.from(document.querySelectorAll('select')).find(s =>
               Array.from(s.querySelectorAll('option')).some(o => /^theboosters-/.test(o.value))
             )
             if (!sel) return { ok:false, step:'no editor theme select' }
             const groups = Array.from(sel.querySelectorAll('optgroup')).map(g => g.label)
             const total = sel.querySelectorAll('option').length
             toggle.click(); await sleep(300)
             const collapsed = sel.querySelectorAll('option').length
             return { ok:true, groups, total, collapsed }
           })()`,
          true
        )
        check(
          '「すべて表示」で残りのテーマが出る',
          expanded.ok && expanded.groups.length === 2 && expanded.total > 40,
          expanded
        )
        check(
          '畳むと元の件数に戻る',
          expanded.ok && expanded.collapsed < 20,
          expanded
        )

        // --- 修飾キー + 数字でタブを移動できる（本体のスニペットタブと同じ）---
        const jump = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             const activeTab = () => {
               const btn = Array.from(document.querySelectorAll('button'))
                 .find(b => /nav-button--active/.test(b.className))
               return btn ? (btn.textContent || '').trim() : null
             }
             const before = activeTab()
             const hintsBefore = document.querySelectorAll('[class*="nav-button-hint"]').length
             // 修飾キーを押しっぱなしにするとバッジが出る
             const isMac = /Mac/.test(navigator.userAgent)
             const mod = isMac ? { key: 'Meta', metaKey: true } : { key: 'Control', ctrlKey: true }
             window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true }, mod)))
             await sleep(300)
             const hintsHeld = document.querySelectorAll('[class*="nav-button-hint"]').length
             window.dispatchEvent(new KeyboardEvent('keyup', Object.assign({ bubbles: true, key: mod.key }, {})))
             await sleep(300)
             const hintsAfter = document.querySelectorAll('[class*="nav-button-hint"]').length
             return { before, hintsBefore, hintsHeld, hintsAfter }
           })()`,
          true
        )
        check(
          '修飾キーを押している間だけタブに番号が出る',
          jump.hintsBefore === 0 && jump.hintsHeld > 0 && jump.hintsAfter === 0,
          jump
        )

        // 実際に Cmd/Ctrl+1 を撃って移動するか（合成イベントではなく実入力）
        const SUPER = process.platform === 'darwin' ? 'cmd' : 'control'
        wc.sendInputEvent({ type: 'keyDown', keyCode: '1', modifiers: [SUPER] })
        wc.sendInputEvent({ type: 'keyUp', keyCode: '1', modifiers: [SUPER] })
        await new Promise(resolve => setTimeout(resolve, 600))
        const moved = await wc.executeJavaScript(
          `(() => {
             const btn = Array.from(document.querySelectorAll('button'))
               .find(b => /nav-button--active/.test(b.className))
             return { active: btn ? (btn.textContent || '').trim() : null }
           })()`,
          true
        )
        check(
          'Cmd/Ctrl+1 で1番目のタブ（ストレージ）へ移動する',
          /ストレージ|Storage/.test(moved.active || ''),
          moved
        )
        // 元のタブへ戻す（後続の検証がインターフェースを見るため）
        wc.sendInputEvent({ type: 'keyDown', keyCode: '3', modifiers: [SUPER] })
        wc.sendInputEvent({ type: 'keyUp', keyCode: '3', modifiers: [SUPER] })
        await new Promise(resolve => setTimeout(resolve, 600))

        const shot1 = path.join(
          process.env.TB_SHOT_DIR || os.tmpdir(),
          'prefs-interface.png'
        )
        fs.writeFileSync(shot1, (await win.webContents.capturePage()).toPNG())
        rows.push({ label: 'SHOT (設定画面)', data: shot1 })

        // --- プリセットを押すと設定が変わる ---
        const applied = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             const buttons = Array.from(document.querySelectorAll('[class*="preset"]'))
               .filter(el => el.tagName === 'BUTTON')
             const dark = buttons.find(b => /暗|Dark/.test(b.textContent))
             if (!dark) return { ok:false, step:'no dark preset' }
             dark.click(); await sleep(800)
             const config = JSON.parse(localStorage.getItem('config') || '{}')
             return {
               ok: true,
               uiTheme: config.ui && config.ui.theme,
               editorTheme: config.editor && config.editor.theme,
               codeBlockTheme: config.preview && config.preview.codeBlockTheme,
               bodyTheme: document.body.getAttribute('data-theme')
             }
           })()`,
          true
        )
        check(
          'プリセット（暗）が設定に反映される',
          applied.editorTheme === 'theboosters-dark' &&
            applied.uiTheme === 'dark' &&
            applied.codeBlockTheme === 'theboosters-dark',
          applied
        )
        check(
          '押した時点で画面にも反映される（保存ボタンを探させない）',
          applied.bodyTheme === 'dark',
          applied.bodyTheme
        )

        // --- プリセットの文字が読めるか（暗テーマで実測）---
        // ここは「コントラストを直す」ための画面なので、この画面自体が
        // 読めないのは論外。**実際に描かれている色**で測る
        const measured = await wc.executeJavaScript(
          `(() => {
             const buttons = Array.from(document.querySelectorAll('[class*="preset"]'))
               .filter(el => el.tagName === 'BUTTON')
             return buttons.map(btn => {
               const label = btn.querySelector('[class*="preset-label"]')
               const desc = btn.querySelector('[class*="preset-description"]')
               const layers = []
               let node = btn
               for (let i = 0; i < 20 && node && node.nodeType === 1; i++) {
                 layers.push(getComputedStyle(node).backgroundColor)
                 node = node.parentElement
               }
               return {
                 text: (label ? label.textContent : '').slice(0, 12),
                 labelColor: label ? getComputedStyle(label).color : null,
                 descColor: desc ? getComputedStyle(desc).color : null,
                 layers
               }
             })
           })()`,
          true
        )
        measured.forEach(item => {
          const bg = effectiveBackground(item.layers)
          const label = parseCssColor(item.labelColor)
          const desc = parseCssColor(item.descColor)
          if (!bg || !label || !desc) {
            check(`プリセット「${item.text}」の色が読めない`, false, item)
            return
          }
          check(
            `プリセット「${item.text}」の見出しが 4.5:1 以上`,
            contrastRatio(label, bg) >= 4.5,
            {
              ratio: Math.round(contrastRatio(label, bg) * 100) / 100,
              color: item.labelColor
            }
          )
          check(
            `プリセット「${item.text}」の説明が 4.5:1 以上`,
            contrastRatio(desc, bg) >= 4.5,
            {
              ratio: Math.round(contrastRatio(desc, bg) * 100) / 100,
              color: item.descColor
            }
          )
        })

        const shot2 = path.join(
          process.env.TB_SHOT_DIR || os.tmpdir(),
          'prefs-preset-dark.png'
        )
        fs.writeFileSync(shot2, (await win.webContents.capturePage()).toPNG())
        rows.push({ label: 'SHOT (暗プリセット適用後)', data: shot2 })

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

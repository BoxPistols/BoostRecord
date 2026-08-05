// (1) スニペットノートを挟んでも全面 Preview が保たれるかの検証と、
// (2) Tab が実機条件で効かない件の診断を1回の起動でまとめて行う probe。
//
// (1) は Detail/index.js がノート種別で別コンポーネントを描くため、
// MarkdownNoteDetail が unmount され previewOnly が失われていた件。
// (2) は「probe は緑なのに実機で効かない」ので、probe 側が実際の操作を
// 再現できていない前提を疑い、開始状態を変えて観測を取る。
//
// Exit: 0 pass / 1 fail / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const SHOT_DIR = process.env.TB_SHOT_DIR || os.tmpdir()
const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-viewmode-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-viewmode-'))
const storageDir = path.join(tmpRoot, 'storage')
const notesDir = path.join(storageDir, 'notes')
fs.mkdirSync(notesDir, { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'nfolder', name: 'Notes', color: '#E10051' }],
    version: '1.0'
  })
)

// CSON は JSON を受け付けるので、ノートは JSON のまま .cson として置ける
const BASE = {
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  folder: 'nfolder',
  tags: [],
  isStarred: false,
  isTrashed: false
}
function seedNote(key, note) {
  fs.writeFileSync(
    path.join(notesDir, `${key}.cson`),
    JSON.stringify(Object.assign({}, BASE, note))
  )
}
// 一覧は更新日時の降順。上から MDTOP → SNIPMID → MDBOTTOM に並ぶよう日付をずらす
seedNote('aaaa000000000001', {
  type: 'MARKDOWN_NOTE',
  title: 'MDTOP',
  content: '# MDTOP\n\nmarkdown body',
  updatedAt: '2026-08-03T00:00:00.000Z'
})
seedNote('aaaa000000000002', {
  type: 'SNIPPET_NOTE',
  title: 'SNIPMID',
  description: 'SNIPMID',
  updatedAt: '2026-08-02T00:00:00.000Z',
  snippets: [
    { name: 'a.txt', mode: 'text', content: 'hello', linesHighlighted: [] }
  ]
})
seedNote('aaaa000000000003', {
  type: 'MARKDOWN_NOTE',
  title: 'MDBOTTOM',
  content: '# MDBOTTOM\n\nmarkdown body',
  updatedAt: '2026-08-01T00:00:00.000Z'
})

app.setPath('userData', path.join(tmpRoot, 'userData'))
app.setPath('home', tmpRoot)

const checks = []
const notes = []
const shots = []
function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail })
}
function note(name, detail) {
  notes.push({ name, detail })
}

let finished = false
let ran = false
function finish(code, result) {
  if (finished) return
  finished = true
  console.log('\n=== viewmode / tab probe ===')
  checks.forEach(c => {
    console.log(
      `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${
        c.detail === undefined ? '' : `  — ${JSON.stringify(c.detail)}`
      }`
    )
  })
  notes.forEach(n =>
    console.log(`INFO  ${n.name} — ${JSON.stringify(n.detail)}`)
  )
  shots.forEach(s => console.log(`SHOT  ${s}`))
  const passed = checks.filter(c => c.pass).length
  console.log(`--- ${passed}/${checks.length} passed, exit ${code}`)
  if (result && result.error) console.log(`ERROR: ${result.error}`)
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, checks, notes, shots, result }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 120000)

function seed() {
  return `(() => {
    if (localStorage.getItem('__viewmodeProbeSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__viewmodeProbeSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

const helpers = `
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const list = () => document.querySelector('[data-note-list]')
  // ModeSwitcher は CSS Modules だが aria-pressed と fa アイコンは安定
  const modeButtons = () => Array.from(document.querySelectorAll('button[aria-pressed]'))
    .filter(b => b.querySelector('i.fa'))
  const activeMode = () => {
    const b = modeButtons().find(x => x.getAttribute('aria-pressed') === 'true')
    if (!b) return null
    const i = b.querySelector('i.fa')
    const cls = i ? i.className : ''
    if (cls.indexOf('fa-eye') !== -1) return 'PREVIEW'
    if (cls.indexOf('fa-columns') !== -1) return 'SPLIT'
    if (cls.indexOf('fa-pencil') !== -1) return 'EDITOR'
    return 'UNKNOWN'
  }
  const focusInfo = () => {
    const el = document.activeElement
    return {
      tag: el ? el.tagName : null,
      cls: el ? String(el.className || '').slice(0, 60) : null,
      inNoteList: !!(el && list() && list().contains(el)),
      inSideNav: !!(el && el.closest && el.closest('.SideNav')),
      inEditor: !!(el && el.closest && el.closest('.CodeMirror'))
    }
  }
  const clickNote = title => {
    const l = list(); if (!l) return false
    const hit = Array.from(l.querySelectorAll('*'))
      .find(n => n.children.length === 0 && (n.textContent || '').trim() === title)
    if (!hit) return false
    hit.click(); return true
  }
`

function evalJs(body) {
  return `(async () => {${helpers}\n${body}\n})()`
}

function pressKey(wc, keyCode, modifiers = []) {
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  return new Promise(resolve => setTimeout(resolve, 350))
}

async function shootPane(win, name) {
  const img = await win.webContents.capturePage()
  const file = path.join(SHOT_DIR, name)
  fs.writeFileSync(file, img.toPNG())
  shots.push(file)
}

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

        const ready = await wc.executeJavaScript(
          evalJs(`for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && list()) break; await sleep(250) }
            return { list: !!list(), titles: list() ? list().innerText.split('\\n').filter(Boolean).slice(0,8) : [] }`),
          true
        )
        note('note list (seed 前)', ready)
        if (!ready.list) return finish(2, { error: 'note list never mounted' })

        // ---------- (2) Tab の診断: 何も触っていない状態から ----------
        const coldFocus = await wc.executeJavaScript(
          evalJs('return focusInfo()'),
          true
        )
        await pressKey(wc, 'Tab')
        const coldAfter = await wc.executeJavaScript(
          evalJs(
            'return { focus: focusInfo(), trace: window.__tbPaneTab || null }'
          ),
          true
        )
        note('Tab: 起動直後（クリックなし）', {
          before: coldFocus,
          after: coldAfter
        })
        check(
          '起動直後の Tab がノート一覧へ移る',
          coldAfter.focus.inNoteList,
          coldAfter
        )

        // フォーカス移動が見た目に出ているか（出ていなければ「効かない」に見える）
        const ring = await wc.executeJavaScript(
          evalJs(`const el = document.activeElement
            if (!el) return null
            const s = getComputedStyle(el)
            return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow.slice(0,60) }`),
          true
        )
        note('フォーカス先の見た目', ring)
        check(
          'フォーカス移動が視覚的に分かる（outline か box-shadow）',
          !!ring &&
            ((ring.outlineStyle !== 'none' && ring.outlineWidth !== '0px') ||
              (ring.boxShadow && ring.boxShadow !== 'none')),
          ring
        )

        // ---------- (3) 目次ペイン ----------
        // .cson を直接置く方式ではノートが一覧に出ないので、他の probe と同じく
        // UI からノートを作る（NewNoteButton → モーダル → CodeMirror へ流し込み）
        const made = await wc.executeJavaScript(
          `(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms))
             const newBtn = document.querySelector('.NewNoteButton button')
             if (!newBtn) return { ok: false, step: 'no NewNoteButton' }
             newBtn.click(); await sleep(700)
             const modal = document.querySelector('.ModalBase') || document
             const md = Array.from(modal.querySelectorAll('button'))
               .find(b => /markdown|マークダウン/i.test(b.textContent))
             if (!md) return { ok: false, step: 'no markdown button' }
             md.click()
             let cm = null
             for (let i = 0; i < 40; i++) {
               cm = document.querySelector('.CodeMirror')
               if (cm && cm.CodeMirror && cm.CodeMirror.getValue() === '') break
               cm = null; await sleep(250)
             }
             if (!cm) return { ok: false, step: 'no empty editor' }
             cm.CodeMirror.setValue(
               '# Alpha\\n\\n- [ ] todo one\\n- [x] todo two\\n\\ntext\\n\\n## Beta\\n\\n\\\`\\\`\\\`sh\\n# not a heading\\n\\\`\\\`\\\`\\n\\n### Gamma\\n'
             )
             await sleep(1200)
             return { ok: true }
           })()`,
          true
        )
        check('ノートを作れる', made.ok, made)
        if (!made.ok)
          return finish(2, { error: 'probe setup failed: ' + made.step })

        const tocView = await wc.executeJavaScript(
          `(() => {
             const pane = document.querySelector('.TocPane')
             const editor = document.querySelector('.MarkdownSplitEditor, .NoteDetail')
             const r = pane ? pane.getBoundingClientRect() : null
             const e = editor ? editor.getBoundingClientRect() : null
             return {
               paneVisible: !!(pane && pane.offsetParent !== null),
               paneRect: r ? { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) } : null,
               editorWidth: e ? Math.round(e.width) : null,
               toggle: !!document.querySelector('button i.fa-list-ul'),
               // ツールバーの並び: 目次ボタンはゴミ箱の手前（右端の単独アイコン群）
               toolbar: Array.from(
                 document.querySelectorAll('[class*="info-right"] button')
               ).map(b => {
                 const i = b.querySelector('i.fa')
                 return i ? (i.className.match(/fa-[a-z-]+/) || [''])[0] : 'other'
               }),
               // TODO バーと目次が重なっていないか
               rects: (() => {
                 const bar = document.querySelector('[class*="percentageBar"]')
                 const body = document.querySelector('[class*="body-editor"]')
                 const p = document.querySelector('.TocPane')
                 const r = n => { const b = n && n.getBoundingClientRect(); return b ? { top: Math.round(b.top), bottom: Math.round(b.bottom) } : null }
                 return { bar: r(bar), body: r(body), toc: r(p) }
               })(),
               overlap: (() => {
                 const bar = document.querySelector('[class*="percentageBar"]')
                 const p = document.querySelector('.TocPane')
                 if (!bar || !p) return null
                 const b = bar.getBoundingClientRect()
                 const t = p.getBoundingClientRect()
                 if (getComputedStyle(bar).display === 'none') return 'no-bar'
                 return b.bottom > t.top ? 'OVERLAP' : 'ok'
               })()
             }
           })()`,
          true
        )
        tocView.items = await wc.executeJavaScript(
          `(() => Array.from(document.querySelectorAll('.TocPane button'))
             .map(b => (b.textContent || '').trim()).filter(Boolean))()`,
          true
        )
        note('目次ペイン', tocView)
        check(
          '見出しが並ぶ（コードフェンス内の # は入らない）',
          JSON.stringify(tocView.items) ===
            JSON.stringify(['Alpha', 'Beta', 'Gamma']),
          tocView.items
        )
        check('目次ペインが描画されている', tocView.paneVisible, tocView)
        check(
          '目次ペインに幅と高さがある（潰れていない）',
          !!tocView.paneRect &&
            tocView.paneRect.w > 100 &&
            tocView.paneRect.h > 100,
          tocView.paneRect
        )
        check('目次の表示切替ボタンがある', tocView.toggle)
        check(
          'TODO バーが出ていて、目次に食い込んでいない',
          tocView.overlap === 'ok',
          { overlap: tocView.overlap }
        )
        check(
          '目次の切替ボタンが右端のアイコン群にある（ModeSwitcher の外）',
          (() => {
            const t = tocView.toolbar || []
            const i = t.indexOf('fa-list-ul')
            return i > t.indexOf('fa-eye')
          })(),
          tocView.toolbar
        )
        await shootPane(win, 'toc-pane.png')

        // ---------- (1) Preview がスニペットを跨いで保たれるか ----------
        // アプリは seed した boostnote.json のフォルダキーを無視して自前生成
        // する。先に .cson を置いても folder が一致せず一覧に出ないので、
        // 生成後の実キーを読んでから書き直して reload する
        const meta = JSON.parse(
          fs.readFileSync(path.join(storageDir, 'boostnote.json'), 'utf8')
        )
        const folderKey =
          meta.folders && meta.folders[0] ? meta.folders[0].key : null
        note('生成されたフォルダキー', { folderKey })
        if (!folderKey) return finish(2, { error: 'no folder key' })
        BASE.folder = folderKey
        seedNote('aaaa000000000001', {
          type: 'MARKDOWN_NOTE',
          title: 'MDTOP',
          content: '# MDTOP\n\nmarkdown body',
          updatedAt: '2026-08-03T00:00:00.000Z'
        })
        seedNote('aaaa000000000002', {
          type: 'SNIPPET_NOTE',
          title: 'SNIPMID',
          description: 'SNIPMID',
          updatedAt: '2026-08-02T00:00:00.000Z',
          snippets: [
            {
              name: 'a.txt',
              mode: 'text',
              content: 'hello',
              linesHighlighted: []
            }
          ]
        })
        seedNote('aaaa000000000003', {
          type: 'MARKDOWN_NOTE',
          title: 'MDBOTTOM',
          content: '# MDBOTTOM\n\nmarkdown body',
          updatedAt: '2026-08-01T00:00:00.000Z'
        })

        wc.reload()
        let loaded = { titles: [] }
        for (let i = 0; i < 40; i++) {
          await new Promise(resolve => setTimeout(resolve, 500))
          try {
            loaded = await wc.executeJavaScript(
              evalJs(`if (document.getElementById('loadingCover') || !list()) return { titles: [] }
                return { titles: list().innerText.split('\\n').filter(Boolean).slice(0,10) }`),
              true
            )
          } catch (e) {
            loaded = { titles: [], err: String(e && e.message) }
          }
          if (loaded.titles.some(t => t.indexOf('MDTOP') !== -1)) break
        }
        note('note list (seed 後)', loaded)
        note(
          'アプリが持っている storages',
          await wc.executeJavaScript(
            `(() => { try { return JSON.parse(localStorage.getItem('storages')) } catch (e) { return String(e) } })()`,
            true
          )
        )
        note('notes ディレクトリの中身', {
          files: fs.readdirSync(notesDir),
          boostnote: JSON.parse(
            fs.readFileSync(path.join(storageDir, 'boostnote.json'), 'utf8')
          )
        })
        const seededOk = ['MDTOP', 'SNIPMID', 'MDBOTTOM'].every(t =>
          loaded.titles.some(x => x.indexOf(t) !== -1)
        )
        if (!seededOk) {
          // ここで落ちるのは probe の準備不足であってアプリの不具合ではない。
          // FAIL 扱いにすると「Preview がスニペットで壊れたまま」と誤読される
          // ので、exit 2（probe error）で明確に分ける。
          // 未解決: .cson を直接置く方式ではノートが一覧に出ない。
          // 他の probe と同じく UI 経由で作る方式へ寄せる必要がある
          return finish(2, {
            error:
              'probe setup failed: seeded notes never appeared (Preview の検証は未実施)',
            loaded
          })
        }
        win.focus()
        wc.focus()
        const openedTop = await wc.executeJavaScript(
          evalJs(`if (!clickNote('MDTOP')) return { ok:false }
            await sleep(700); return { ok:true, mode: activeMode() }`),
          true
        )
        check('MDTOP を開ける', openedTop.ok, openedTop)

        const toPreview = await wc.executeJavaScript(
          evalJs(`const b = modeButtons().find(x => (x.querySelector('i.fa')||{}).className.indexOf('fa-eye') !== -1)
            if (!b) return { ok:false }
            b.click(); await sleep(600); return { ok:true, mode: activeMode() }`),
          true
        )
        check(
          '全面 Preview に切り替わる',
          toPreview.mode === 'PREVIEW',
          toPreview
        )

        const onSnippet = await wc.executeJavaScript(
          evalJs(`if (!clickNote('SNIPMID')) return { ok:false }
            await sleep(700); return { ok:true, mode: activeMode() }`),
          true
        )
        note('スニペットノート表示中', onSnippet)

        const backToMd = await wc.executeJavaScript(
          evalJs(`if (!clickNote('MDBOTTOM')) return { ok:false }
            await sleep(800); return { ok:true, mode: activeMode() }`),
          true
        )
        check(
          'スニペットを挟んでも Preview のまま（今回の修正点）',
          backToMd.mode === 'PREVIEW',
          backToMd
        )

        const img = await win.webContents.capturePage()
        const file = path.join(SHOT_DIR, 'viewmode-after-snippet.png')
        fs.writeFileSync(file, img.toPNG())
        shots.push(file)

        finish(checks.every(c => c.pass) ? 0 : 1, {})
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

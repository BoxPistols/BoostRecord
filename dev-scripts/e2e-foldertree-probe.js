// フォルダ名のパス表記による多階層ツリー (#135) の実機検証。
//
// ビルドが通ることと画面が正しく出ることは別。DOM の存在確認だけでも足りない
// （目次ペインで position:absolute が出ておらず、存在はするのに潰れていた実例が
// ある）ので、行の矩形・インデント量・件数まで測る。
//
// Exit: 0 pass / 1 fail / 2 probe error / 3 watchdog
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const SHOT_DIR = process.env.TB_SHOT_DIR || os.tmpdir()
const RESULT_FILE =
  process.env.TB_E2E_RESULT ||
  path.join(os.tmpdir(), 'tb-foldertree-result.json')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-foldertree-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })

// パス表記のフォルダを直接置く。KSD は**実体を持たない中間ノード**として
// 補完されることを確かめたいので、あえて作らない
const FOLDERS = [
  { key: 'fld0000000000001', name: 'MayApp', color: '#E10051' },
  { key: 'fld0000000000002', name: 'KSD/spec', color: '#3498db' },
  { key: 'fld0000000000003', name: 'KSD/onboarding', color: '#2ecc71' },
  { key: 'fld0000000000004', name: 'KSD/onboarding/PR-1281', color: '#f1c40f' }
]
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({ folders: FOLDERS, version: '1.0' })
)

// ノートも置く。フォルダ key は boostnote.json と揃えているので、
// フォルダを自前生成されて一致しなくなる問題は起きない
const NOTES = [
  ['nte0000000000001', 'fld0000000000002', 'SPEC-A', '2026-08-05'],
  ['nte0000000000002', 'fld0000000000003', 'ONB-A', '2026-08-04'],
  ['nte0000000000003', 'fld0000000000004', 'PR-A', '2026-08-03'],
  ['nte0000000000004', 'fld0000000000004', 'PR-B', '2026-08-02']
]
NOTES.forEach(([key, folder, title, day]) => {
  fs.writeFileSync(
    path.join(storageDir, 'notes', `${key}.cson`),
    JSON.stringify({
      createdAt: `${day}T00:00:00.000Z`,
      updatedAt: `${day}T00:00:00.000Z`,
      type: 'MARKDOWN_NOTE',
      folder,
      title,
      content: `# ${title}`,
      tags: [],
      isStarred: false,
      isTrashed: false
    })
  )
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
  console.log('\n=== folder tree probe ===')
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
    if (localStorage.getItem('__folderTreeSeeded') === '1') return true
    // isOpen を立てないとストレージ行が畳まれたままで、フォルダ行が1つも描画されない
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',isOpen:true,path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('__folderTreeSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

// フォルダ行は CSS Modules でクラス名がハッシュ化されるが、
// .SideNav 配下の button で folderList-item を含むものとして拾える
const READ_ROWS = `(() => {
  const nav = document.querySelector('.SideNav')
  if (!nav) return { error: 'no SideNav' }
  const rows = Array.from(nav.querySelectorAll('button')).filter(b =>
    /folderList-item/.test(b.className)
  )
  return {
    rows: rows.map(b => {
      const r = b.getBoundingClientRect()
      const indent = b.querySelector('[class*="folderList-item-indent"]')
      const expander = b.querySelector('[class*="folderList-item-expander"]:not([class*="spacer"])')
      const count = b.querySelector('[class*="folderList-item-noteCount"]')
      const handle = b.querySelector('[class*="folderList-item-reorder"]')
      return {
        label: (b.textContent || '').trim(),
        title: b.getAttribute('title'),
        indent: indent ? Math.round(indent.getBoundingClientRect().width) : 0,
        hasExpander: !!expander,
        expanded: expander ? expander.getAttribute('aria-expanded') : null,
        count: count ? (count.textContent || '').trim() : null,
        hasReorderHandle: !!handle,
        w: Math.round(r.width),
        h: Math.round(r.height)
      }
    })
  }
})()`

function clickExpander(label) {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const nav = document.querySelector('.SideNav')
    const rows = Array.from(nav.querySelectorAll('button')).filter(b =>
      /folderList-item/.test(b.className)
    )
    const row = rows.find(b => (b.getAttribute('title') || '') === ${JSON.stringify(
      '__LABEL__'
    )})
    if (!row) return { ok: false, step: 'row not found' }
    const exp = row.querySelector('[class*="folderList-item-expander"]:not([class*="spacer"])')
    if (!exp) return { ok: false, step: 'no expander' }
    exp.click(); await sleep(400); return { ok: true }
  })()`.replace('"__LABEL__"', JSON.stringify(label))
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true

        const win = BrowserWindow.getAllWindows()[0]
        await wc.executeJavaScript(
          `(async () => { const s = ms => new Promise(r => setTimeout(r, ms))
             for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await s(250) }
             return true })()`,
          true
        )

        const view = await wc.executeJavaScript(READ_ROWS, true)
        if (view.error) return finish(2, { error: view.error })
        note('rows', view.rows)

        const byTitle = t => view.rows.find(r => r.title === t)

        check(
          '4行ではなく5行出る（実体のない中間ノード KSD が補われる）',
          view.rows.length === 5,
          { count: view.rows.length, titles: view.rows.map(r => r.title) }
        )
        check('中間ノード KSD が出ている', !!byTitle('KSD'))
        check(
          'ラベルは葉の名前だけ（フルパスを出すと末尾省略で識別情報が消える）',
          byTitle('KSD/onboarding') &&
            /onboarding/.test(byTitle('KSD/onboarding').label) &&
            !/KSD\//.test(byTitle('KSD/onboarding').label),
          byTitle('KSD/onboarding')
        )
        check(
          'title にフルパスが入る（省略された時の逃げ道）',
          !!byTitle('KSD/onboarding/PR-1281')
        )
        check(
          '深さに応じてインデントが増える',
          byTitle('KSD') &&
            byTitle('KSD/spec') &&
            byTitle('KSD/onboarding/PR-1281') &&
            byTitle('KSD').indent === 0 &&
            byTitle('KSD/spec').indent > 0 &&
            byTitle('KSD/onboarding/PR-1281').indent >
              byTitle('KSD/spec').indent,
          {
            KSD: byTitle('KSD') && byTitle('KSD').indent,
            spec: byTitle('KSD/spec') && byTitle('KSD/spec').indent,
            pr:
              byTitle('KSD/onboarding/PR-1281') &&
              byTitle('KSD/onboarding/PR-1281').indent
          }
        )
        check(
          '子を持つ行にだけ開閉トグルが出る',
          byTitle('KSD') &&
            byTitle('KSD').hasExpander &&
            byTitle('KSD/spec') &&
            !byTitle('KSD/spec').hasExpander,
          {
            KSD: byTitle('KSD') && byTitle('KSD').hasExpander,
            spec: byTitle('KSD/spec') && byTitle('KSD/spec').hasExpander
          }
        )
        check(
          'ネストがある間は並び替えハンドルを出さない（別のフォルダを動かすため）',
          view.rows.every(r => !r.hasReorderHandle),
          view.rows.map(r => r.hasReorderHandle)
        )
        check(
          '行が潰れていない',
          view.rows.every(r => r.h > 10 && r.w > 50),
          view.rows.map(r => ({ w: r.w, h: r.h }))
        )

        const img = await win.webContents.capturePage()
        const f1 = path.join(SHOT_DIR, 'folder-tree-expanded.png')
        fs.writeFileSync(f1, img.toPNG())
        shots.push(f1)

        // 折りたたみ
        const collapsed = await wc.executeJavaScript(
          clickExpander('KSD/onboarding'),
          true
        )
        check('開閉トグルを押せる', collapsed.ok, collapsed)
        const after = await wc.executeJavaScript(READ_ROWS, true)
        note(
          'rows after collapse',
          after.rows.map(r => r.title)
        )
        check(
          '畳むと子孫が消える',
          after.rows.length === 4 &&
            !after.rows.some(r => r.title === 'KSD/onboarding/PR-1281'),
          { count: after.rows.length, titles: after.rows.map(r => r.title) }
        )
        check(
          '畳んでも親の件数は子孫の合計のまま',
          after.rows.find(r => r.title === 'KSD') !== undefined,
          after.rows.find(r => r.title === 'KSD')
        )

        // --- ノート一覧のサブフォルダ別グループ表示 ---
        // KSD を開き直してから、KSD/onboarding（子を持つ）を選ぶ
        await wc.executeJavaScript(clickExpander('KSD/onboarding'), true)
        const picked = await wc.executeJavaScript(
          `(async () => {
             const sleep = ms => new Promise(r => setTimeout(r, ms))
             const nav = document.querySelector('.SideNav')
             const rows = Array.from(nav.querySelectorAll('button')).filter(b =>
               /folderList-item/.test(b.className))
             const row = rows.find(b => (b.getAttribute('title')||'') === 'KSD/onboarding')
             if (!row) return { ok: false }
             row.click(); await sleep(900); return { ok: true }
           })()`,
          true
        )
        check('親フォルダを選べる', picked.ok, picked)

        const listView = await wc.executeJavaScript(
          `(() => {
             const list = document.querySelector('[data-note-list]')
             if (!list) return { error: 'no note list' }
             const headers = Array.from(list.querySelectorAll('[data-group-header]'))
               .map(h => ({ path: h.getAttribute('data-group-header'), label: (h.textContent||'').trim() }))
             const items = Array.from(list.querySelectorAll('[class*="item-title"], [class*="item-simple-title"]'))
               .map(n => (n.textContent||'').trim())
             return { headers, items }
           })()`,
          true
        )
        note('note list', listView)
        check(
          '子孫のノートが一覧に出る（親を選ぶと配下がまとまって見える）',
          ['ONB-A', 'PR-A', 'PR-B'].every(t =>
            (listView.items || []).some(i => i.indexOf(t) !== -1)
          ) && !(listView.items || []).some(i => i.indexOf('SPEC-A') !== -1),
          listView.items
        )
        check(
          'サブフォルダ見出しが出る',
          (listView.headers || []).length === 2 &&
            listView.headers.some(h => h.path === 'KSD/onboarding') &&
            listView.headers.some(h => h.path === 'KSD/onboarding/PR-1281'),
          listView.headers
        )
        check(
          '同じサブフォルダのノートが隣接する（見出しが繰り返されない）',
          (listView.headers || []).length ===
            new Set((listView.headers || []).map(h => h.path)).size,
          listView.headers
        )

        const img3 = await win.webContents.capturePage()
        const f3 = path.join(SHOT_DIR, 'folder-tree-grouped-list.png')
        fs.writeFileSync(f3, img3.toPNG())
        shots.push(f3)

        const img2 = await win.webContents.capturePage()
        const f2 = path.join(SHOT_DIR, 'folder-tree-collapsed.png')
        fs.writeFileSync(f2, img2.toPNG())
        shots.push(f2)

        finish(checks.every(c => c.pass) ? 0 : 1, {})
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

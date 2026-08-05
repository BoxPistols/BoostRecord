// Real-app probe for the API-key credential store (main process).
//
// ユニットテストは safeStorage を偽物に差し替えているので、「実物の safeStorage
// が этой 環境で動くか」「IPC が実際に登録されているか」「起動時の移行が本当に
// 走るか」はここでしか分からない。lib/*.js の変更は Electron を完全に起動し
// 直さないと反映されない（dev の reload では renderer しか作り直されない）。
//
// 確認すること:
//   1. safeStorage が使えるか（使えない環境なら以降は skip 扱い）
//   2. 起動時の移行: localStorage の平文キーが消え、資格情報ストアへ移ること
//   3. 保存ファイルに平文が残らないこと
//   4. renderer からキー本体を読み出す口が無いこと
//   5. 保存 → 設定済み表示 → 削除 の往復
//
// 判定は stdout に出す（CI では結果ファイルを読めない）。
// Exit: 0 pass / 1 fail / 2 probe error / 3 watchdog
const { app, safeStorage } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createSecureKeyStore, STORE_FILENAME } = require('../lib/ai/secureKeys')

const RESULT_FILE =
  process.env.TB_E2E_RESULT || path.join(os.tmpdir(), 'tb-aikeys-result.json')
const PLAINTEXT_KEY = 'sk-probe-' + 'A'.repeat(24)
const SECOND_KEY = 'sk-probe2-' + 'B'.repeat(24)

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-aikeys-'))
const storageDir = path.join(tmpRoot, 'storage')
fs.mkdirSync(path.join(storageDir, 'notes'), { recursive: true })
fs.writeFileSync(
  path.join(storageDir, 'boostnote.json'),
  JSON.stringify({
    folders: [{ key: 'nfolder', name: 'Notes', color: '#E10051' }],
    version: '1.0'
  })
)
const userDataDir = path.join(tmpRoot, 'userData')
app.setPath('userData', userDataDir)
app.setPath('home', tmpRoot)

const storeFile = path.join(userDataDir, STORE_FILENAME)

const checks = []
function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail })
}

let finished = false
let ran = false
function finish(code, result) {
  if (finished) return
  finished = true
  // CI で残るのは stdout だけ。判定を必ずここに出す
  console.log('\n=== ai-keys probe ===')
  checks.forEach(c => {
    console.log(
      `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${
        c.detail === undefined ? '' : `  — ${JSON.stringify(c.detail)}`
      }`
    )
  })
  const passed = checks.filter(c => c.pass).length
  console.log(`--- ${passed}/${checks.length} passed, exit ${code}`)
  if (result && result.error) console.log(`ERROR: ${result.error}`)
  try {
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify({ exitCode: code, checks, result }, null, 2)
    )
  } catch (e) {}
  setTimeout(() => app.exit(code), 300)
}
setTimeout(() => finish(3, { error: 'watchdog' }), 90000)

// 平文キーを積んだ config ごと seed して reload。移行は起動時に走るので、
// この reload 後の状態が「実機の初回起動」に相当する
// 「storages が空か」で seed 済みを判定してはいけない。アプリは起動中に
// storages を自前生成するので、初回ロードの時点で既に埋まっており、平文キー入り
// の config を一度も書かないまま「seed 済み」と誤判定する（移行を素通りして
// 全部 PASS に見える偽陰性になった）。専用マーカーで判定する
function seed() {
  return `(() => {
    if (localStorage.getItem('__aikeysProbeSeeded') === '1') return true
    localStorage.setItem('storages', JSON.stringify([{key:'ts',name:'Notes',type:'FILESYSTEM',path:${JSON.stringify(
      storageDir
    )}}]))
    localStorage.setItem('config', JSON.stringify({
      zoom:1, isSideNavFolded:false, listWidth:280,
      ai:{ provider:'openai',
           openai:{ apiKey:${JSON.stringify(
             PLAINTEXT_KEY
           )}, model:'gpt-5.6-luna' },
           gemini:{ apiKey:'', model:'gemini-2.5-flash' } }
    }))
    localStorage.setItem('__aikeysProbeSeeded','1')
    setTimeout(()=>location.reload(),50); return false
  })()`
}

function waitReady() {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    for (let i=0;i<40;i++){ if(!document.getElementById('loadingCover') && document.querySelector('.SideNav')) break; await sleep(250) }
    return !!document.querySelector('.SideNav')
  })()`
}

function readConfigApiKey(provider) {
  return `(() => { try {
    const c = JSON.parse(localStorage.getItem('config'))
    return (c && c.ai && c.ai.${provider} && c.ai.${provider}.apiKey) || ''
  } catch (e) { return 'PARSE_ERROR' } })()`
}

function invoke(channel, payload) {
  return `require('electron').ipcRenderer.invoke(${JSON.stringify(channel)}${
    payload === undefined ? '' : `, ${JSON.stringify(payload)}`
  }).then(r => ({ ok: true, value: r }), e => ({ ok: false, error: String(e && e.message || e) }))`
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await wc.executeJavaScript(seed(), true)
        if (!seeded || ran) return
        ran = true

        const ready = await wc.executeJavaScript(waitReady(), true)
        if (!ready) return finish(2, { error: 'SideNav never mounted' })

        // 1. 実物の safeStorage が使えるか
        const available = safeStorage.isEncryptionAvailable()
        check('safeStorage.isEncryptionAvailable()', available, { available })
        if (!available) {
          // 使えない環境では移行しない＝平文が残るのが正しい挙動
          const kept = await wc.executeJavaScript(
            readConfigApiKey('openai'),
            true
          )
          check(
            '暗号化不可なら平文を消さない',
            kept === PLAINTEXT_KEY,
            kept === PLAINTEXT_KEY ? undefined : { kept }
          )
          return finish(checks.every(c => c.pass) ? 0 : 1, { skipped: true })
        }

        const store = createSecureKeyStore({ safeStorage, filePath: storeFile })

        // 2. 起動時の移行（migratePlaintextKeys は render callback で走る）
        let configKey = 'never-checked'
        for (let i = 0; i < 40; i++) {
          configKey = await wc.executeJavaScript(
            readConfigApiKey('openai'),
            true
          )
          if (configKey === '') break
          await new Promise(resolve => setTimeout(resolve, 250))
        }
        check('起動時に config の平文キーが消える', configKey === '', {
          configKey
        })
        check(
          '消えた平文キーが資格情報ストアで読める',
          store.get('openai') === PLAINTEXT_KEY
        )

        // 3. 保存ファイルに平文が残らない
        const raw = fs.existsSync(storeFile)
          ? fs.readFileSync(storeFile, 'utf8')
          : ''
        check('保存ファイルが存在する', !!raw)
        check(
          '保存ファイルに平文が無い',
          !!raw && raw.indexOf(PLAINTEXT_KEY) === -1
        )
        if (process.platform !== 'win32' && raw) {
          const mode = fs.statSync(storeFile).mode & 0o777
          check('保存ファイルは 0600', mode === 0o600, {
            mode: mode.toString(8)
          })
        }

        // 4. renderer からキー本体を取り出す口が無い
        const status = await wc.executeJavaScript(
          invoke('ai:keys-status'),
          true
        )
        check('ai:keys-status が応答する', status.ok, status)
        check(
          'status は available/configured だけでキーを含まない',
          status.ok &&
            JSON.stringify(status.value).indexOf(PLAINTEXT_KEY) === -1 &&
            status.value.configured &&
            status.value.configured.openai === true,
          status.value
        )
        const leak = await wc.executeJavaScript(
          invoke('ai:keys-get', 'openai'),
          true
        )
        check('キーを読み出す channel は存在しない', leak.ok === false, leak)

        // 5. 保存 → 設定済み → 削除
        const set = await wc.executeJavaScript(
          invoke('ai:keys-set', { provider: 'gemini', key: SECOND_KEY }),
          true
        )
        check(
          'ai:keys-set が成功する',
          set.ok && set.value && set.value.ok,
          set
        )
        check(
          '保存したキーが main 側で読める',
          store.get('gemini') === SECOND_KEY
        )
        const unknown = await wc.executeJavaScript(
          invoke('ai:keys-set', { provider: 'anthropic', key: 'x' }),
          true
        )
        check(
          '未知の provider は拒否する',
          unknown.ok && unknown.value && unknown.value.ok === false,
          unknown.value
        )
        const cleared = await wc.executeJavaScript(
          invoke('ai:keys-set', { provider: 'gemini', key: '' }),
          true
        )
        check(
          '空文字で削除できる',
          cleared.ok &&
            cleared.value &&
            cleared.value.ok &&
            !store.has('gemini')
        )
        check('削除しても他の provider は残る', store.has('openai'))

        finish(checks.every(c => c.pass) ? 0 : 1, {})
      } catch (err) {
        finish(2, {
          error: 'exec failed: ' + (err && (err.stack || err.message))
        })
      }
    }, 4000)
  })
})

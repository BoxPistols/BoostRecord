// Renderer-side wrapper over the secure API-key channels (see lib/ai/ipc.js).
//
// キー本体を取り出す口は無い。renderer が知れるのは「暗号化が使えるか」と
// 「provider ごとに設定済みか」だけで、平文は main プロセスから出てこない。
const { ipcRenderer } = require('electron')
import ConfigManager from 'browser/main/lib/ConfigManager'

export const KEY_PROVIDERS = ['openai', 'gemini']

const UNAVAILABLE = {
  configured: { openai: false, gemini: false },
  fromEnv: { openai: false, gemini: false }
}

/**
 * provider ごとに「設定済みか」「環境変数で動くか」だけを返す。
 *
 * 暗号化の可否はここでは分からない（調べるとキーチェーンの許可ダイアログが
 * 出るため、実際に預ける直前まで遅らせている）。可否が要る時は
 * getEncryptionAvailable() を使う。
 *
 * @returns {Promise<{configured: Object<string, boolean>, fromEnv: Object<string, boolean>}>}
 */
export function getKeyStatus() {
  return ipcRenderer.invoke('ai:keys-status').then(
    res => res || UNAVAILABLE,
    () => UNAVAILABLE
  )
}

/**
 * 暗号化して預けられるか。**キーチェーンの許可ダイアログが出うる**ので、
 * キーを保存する直前にだけ呼ぶ。
 *
 * @returns {Promise<boolean>}
 */
export function getEncryptionAvailable() {
  return ipcRenderer.invoke('ai:keys-encryption').then(
    res => !!(res && res.available),
    () => false
  )
}

/**
 * その provider で実際に AI を呼べる見込みがあるか。
 *
 * 「押しても必ず失敗する導線を出さない」ための判定をここ1か所に置く。
 * 資格情報ストア → 環境変数 → config に残っている平文、の順で見る。main 側の
 * resolveKey と同じ優先順位だが、こちらが見るのは真偽値だけで値は見ない。
 *
 * @param {{configured?: Object, fromEnv?: Object}} status getKeyStatus() の結果
 * @param {string} provider
 * @param {object} [aiConfig] ConfigManager.get().ai
 * @returns {boolean}
 */
export function isProviderUsable(status, provider, aiConfig) {
  const s = status || UNAVAILABLE
  if (s.configured && s.configured[provider]) return true
  if (s.fromEnv && s.fromEnv[provider]) return true
  const legacy = ((aiConfig || {})[provider] || {}).apiKey
  return typeof legacy === 'string' && legacy.trim() !== ''
}

/**
 * キーを保存する。空文字を渡すと削除。
 * @returns {Promise<{ok: boolean, cleared?: boolean, error?: string}>}
 */
export function saveKey(provider, key) {
  return ipcRenderer.invoke('ai:keys-set', { provider, key }).then(
    res => res || { ok: false, error: 'NO_RESPONSE' },
    err => ({
      ok: false,
      error: (err && err.message) || 'IPC_FAILED'
    })
  )
}

let migrationRun = false

/**
 * localStorage に平文で残っている API キーを資格情報ストアへ移す。
 *
 * 起動時に1回だけ呼ぶ。**書き込みと読み戻しに成功した provider だけ** config
 * 側を空にする。ここを「先に消してから書く」順にすると、暗号化が使えない環境
 * や書き込み失敗でキーが消える。
 *
 * @returns {Promise<{migrated: string[], failed: string[]}>}
 */
export function migratePlaintextKeys() {
  if (migrationRun) return Promise.resolve({ migrated: [], failed: [] })
  migrationRun = true

  const ai = ConfigManager.get().ai || {}
  const pending = KEY_PROVIDERS.map(provider => ({
    provider,
    key: ((ai[provider] && ai[provider].apiKey) || '').trim()
  })).filter(entry => !!entry.key)

  if (!pending.length) return Promise.resolve({ migrated: [], failed: [] })

  return Promise.all(
    pending.map(entry =>
      saveKey(entry.provider, entry.key).then(res => ({
        provider: entry.provider,
        ok: !!(res && res.ok)
      }))
    )
  ).then(results => {
    const migrated = results.filter(r => r.ok).map(r => r.provider)
    const failed = results.filter(r => !r.ok).map(r => r.provider)
    if (migrated.length) {
      // 移せたものだけ平文を消す。失敗した provider は触らないので、
      // 暗号化が使えない環境では今までどおり config のキーで動き続ける
      const current = ConfigManager.get().ai || {}
      const next = Object.assign({}, current)
      migrated.forEach(provider => {
        next[provider] = Object.assign({}, current[provider], { apiKey: '' })
      })
      ConfigManager.set({ ai: next })
    }
    return { migrated, failed }
  })
}

// API キーを OS の資格情報ストア経由で保管する（main プロセス専用）。
//
// これまでキーは renderer の localStorage に平文で入っていた。同じユーザー権限
// で動く他プロセスから素で読めるので、Electron の safeStorage
// (macOS = Keychain / Windows = DPAPI / Linux = 各種 keyring) で暗号化し、
// 暗号文だけを userData 配下のファイルに置く。
//
// **読み出し口を IPC に生やさない**のが要点。renderer からは「設定済みか」しか
// 分からず、平文のキーは main プロセスから外へ出ない。
//
// safeStorage / ファイルパスは注入する（electron を require せずに単体テスト
// できるようにするため。lib/ai/keys.js と同じ方針）。

const path = require('path')

const VERSION = 1
const STORE_FILENAME = 'ai-keys.json'

/**
 * @param {{safeStorage: object, filePath: string, fs?: object}} deps
 * @returns {{isAvailable: Function, get: Function, set: Function,
 *            has: Function, listConfigured: Function}}
 */
function createSecureKeyStore(deps) {
  const safeStorage = deps.safeStorage
  const filePath = deps.filePath
  const fs = deps.fs || require('fs')

  // 暗号化が使えない環境（keyring の無い Linux 等）がある。使えないまま
  // 暗号文のつもりで平文を書くのが最悪なので、必ずここで止める
  function isAvailable() {
    try {
      return !!safeStorage && safeStorage.isEncryptionAvailable()
    } catch (e) {
      return false
    }
  }

  function readStore() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (parsed && typeof parsed === 'object' && parsed.keys) return parsed
    } catch (e) {
      // 未作成・壊れている。どちらも「まだ何も入っていない」として扱う
    }
    return { version: VERSION, keys: {} }
  }

  function writeStore(store) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    // 0600: 同一ユーザーの他プロセスは防げないが、他ユーザーからは守る
    fs.writeFileSync(filePath, JSON.stringify(store), { mode: 0o600 })
  }

  /**
   * 復号したキーを返す。取り出せなければ null（例外は投げない）。
   * @param {string} provider
   * @returns {string|null}
   */
  function get(provider) {
    // 保存が無いなら復号するものが無い。isAvailable() を先に呼ぶと、macOS では
    // 何も預けていない利用者にまでキーチェーンの許可ダイアログが出る
    const entry = readStore().keys[provider]
    if (typeof entry !== 'string' || !entry) return null
    if (!isAvailable()) return null
    try {
      return safeStorage.decryptString(Buffer.from(entry, 'base64')) || null
    } catch (e) {
      // 別マシンへコピーされた・keyring が変わった等で復号できない。
      // ここで暗号文を消してはいけない。環境が戻れば読めるし、消すと
      // 利用者は理由も分からないまま再入力を強いられる
      return null
    }
  }

  function has(provider) {
    const entry = readStore().keys[provider]
    return typeof entry === 'string' && !!entry
  }

  function listConfigured(providers) {
    const out = {}
    providers.forEach(p => {
      out[p] = has(p)
    })
    return out
  }

  /**
   * キーを保存する。空文字を渡すと削除。
   *
   * 保存後に**読み戻して復号できることまで確かめてから** ok を返す。
   * 呼び出し側はこの ok を見て config 側の平文を消すので、ここで嘘をつくと
   * 利用者のキーが消える。
   *
   * @param {string} provider
   * @param {string} key
   * @returns {{ok: boolean, cleared?: boolean, error?: string}}
   */
  function set(provider, key) {
    if (!isAvailable()) return { ok: false, error: 'ENCRYPTION_UNAVAILABLE' }
    const trimmed = typeof key === 'string' ? key.trim() : ''
    try {
      const store = readStore()
      if (!trimmed) {
        delete store.keys[provider]
        writeStore(store)
        return { ok: true, cleared: true }
      }
      store.keys[provider] = safeStorage
        .encryptString(trimmed)
        .toString('base64')
      writeStore(store)
      if (get(provider) !== trimmed)
        return { ok: false, error: 'VERIFY_FAILED' }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'WRITE_FAILED' }
    }
  }

  return { isAvailable, get, set, has, listConfigured }
}

module.exports = { createSecureKeyStore, STORE_FILENAME, VERSION }

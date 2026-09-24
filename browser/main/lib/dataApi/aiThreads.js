// AIとの相談スレッドを、ノートごとに保存先フォルダの ai-threads/<noteKey>.json に置く。
//
// 保存先はOneDrive配下にあることが多い。クラウドにだけ実体があるファイルは、読めなかったり
// 0バイトや途中までに見えたりする。これを「スレッド無し」とみなして保存すると、既存の
// スレッドを空で上書きして消してしまう。そこで新規作成してよいのはファイルが存在しない
// （ENOENT）ときだけにし、読めない・解析できないときは保存しない。
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

export const THREADS_DIR = 'ai-threads'
const FILE_VERSION = 1
// 1ノートに残すスレッドの数。古いものから落とす
export const MAX_THREADS = 30

// noteKeyはファイル名になるので、区切り文字や .. を含むものは受けない
function isSafeKey(key) {
  return typeof key === 'string' && /^[A-Za-z0-9_-]+$/.test(key)
}

export function threadsPath(storagePath, noteKey) {
  if (!storagePath || !isSafeKey(noteKey)) return null
  return path.join(storagePath, THREADS_DIR, `${noteKey}.json`)
}

/**
 * @returns {{ok: true, threads: Array} | {ok: false, reason: string}}
 *   ok:falseのときは保存してはいけない（既存のファイルを壊すおそれがある）
 */
export function loadThreads(storagePath, noteKey) {
  const file = threadsPath(storagePath, noteKey)
  if (!file) return { ok: false, reason: 'NO_NOTE' }
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true, threads: [] }
    return { ok: false, reason: 'READ_FAILED' }
  }
  try {
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.threads)) {
      return { ok: false, reason: 'INVALID' }
    }
    return { ok: true, threads: data.threads }
  } catch (err) {
    // 0バイト・途中まで・壊れたJSONはここに来る。空として扱わない
    return { ok: false, reason: 'INVALID' }
  }
}

/**
 * スレッドを1件追加または更新して書く。読み込みに失敗していたら書かない
 * @param {{ok: boolean}} loaded loadThreadsの結果（ok:falseなら書かない）
 * @param {Object} thread { id, mode, title, createdAt, updatedAt, messages }
 * @returns {{ok: true, threads: Array} | {ok: false, reason: string}}
 */
export function saveThread(storagePath, noteKey, loaded, thread) {
  if (!loaded || loaded.ok !== true) return { ok: false, reason: 'NOT_LOADED' }
  const file = threadsPath(storagePath, noteKey)
  if (!file) return { ok: false, reason: 'NO_NOTE' }
  // 書く直前にもう一度読み、その間に別の端末で増えたスレッドを落とさない
  const latest = loadThreads(storagePath, noteKey)
  if (!latest.ok) return latest
  const others = latest.threads.filter(t => t.id !== thread.id)
  const threads = [thread]
    .concat(others)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_THREADS)
  const body = JSON.stringify({ version: FILE_VERSION, threads }, null, 2)
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // 一時ファイルに書いてから置き換える。途中で止まっても元のファイルは残る
    // 名前に乱数を入れ、ほかのプロセスの一時ファイルと重ならないようにする
    const tmp = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`
    fs.writeFileSync(tmp, body, { flag: 'wx' })
    fs.renameSync(tmp, file)
  } catch (err) {
    return { ok: false, reason: 'WRITE_FAILED' }
  }
  return { ok: true, threads }
}

/**
 * スレッドの見出し。最初の依頼の先頭を使う
 * @param {Array<{role: string, content: string}>} messages
 */
export function threadTitle(messages) {
  const first = (messages || []).find(m => m.role === 'user')
  const text = first ? first.content.replace(/\s+/g, ' ').trim() : ''
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

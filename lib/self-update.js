// macOSでアプリ自身を新しいバージョンに置き換える（main-app.jsから使う）。
//
// electron-updaterのmacOSの置き換えはSquirrel.Macを通り、Developer IDの署名を求める。
// このアプリはad-hoc署名なので、Squirrelを通さずにzipを取得して展開し、
// 中身を確かめてから.appを入れ替え、自分が終わってから開き直す。
// 信頼しているのはHTTPSでGitHubから取ったことと、Releaseを作れるのが
// リポジトリに書ける人だけであることで、検査は添付の取り違えへの備えである
const { execFile, spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pipeline } = require('stream/promises')
const { Readable } = require('stream')

const APP_NAME = 'BoostRecord'

// 画面側でi18n.__(key, ...args)に通して出す。main側はi18nを持たないので、キーと値を渡す
class UpdateError extends Error {
  constructor(key, ...args) {
    super(args.length ? `${key} ${args.join(' ')}` : key)
    this.i18nKey = key
    this.i18nArgs = args
  }
}

function run(file, args) {
  return new Promise(resolve => {
    execFile(file, args, (err, stdout) => {
      resolve({ ok: !err, stdout: String(stdout || '').trim() })
    })
  })
}

async function readPlistValue(appPath, key) {
  const r = await run('/usr/bin/plutil', [
    '-extract',
    key,
    'raw',
    path.join(appPath, 'Contents', 'Info.plist')
  ])
  return r.ok ? r.stdout : ''
}

async function canWriteParent(appPath) {
  try {
    await fs.promises.access(path.dirname(appPath), fs.constants.W_OK)
    return true
  } catch (_) {
    return false
  }
}

async function discardStaged(staged) {
  if (staged && staged.work) {
    await fs.promises.rm(staged.work, { recursive: true, force: true })
  }
}

// zipを取得して一時ディレクトリに展開し、同じアプリの指定のバージョンであることを確かめる。
// 置き換えはまだしない（利用者が「再起動してインストール」を選ぶまで動いているアプリに触れない）
async function downloadAndVerify({ url, version, currentAppPath, userAgent }) {
  const bundleId = await readPlistValue(currentAppPath, 'CFBundleIdentifier')
  // 自分のIDが読めないと、取ってきた中身が同じアプリかを比べられない
  if (!bundleId) throw new UpdateError('Could not read the app’s bundle ID.')

  const work = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `${APP_NAME}-update-`)
  )
  try {
    const zip = path.join(work, 'update.zip')
    const res = await fetch(url, { headers: { 'user-agent': userAgent } })
    if (!res.ok || !res.body) {
      throw new UpdateError(
        'Could not download the update (HTTP %s).',
        res.status
      )
    }
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip))

    const out = path.join(work, 'extracted')
    // 作る側（electron-builder）のzipはシンボリックリンクと拡張属性を含むので、dittoで展開する
    if (!(await run('/usr/bin/ditto', ['-x', '-k', zip, out])).ok) {
      throw new UpdateError('Could not extract the downloaded zip.')
    }
    // 展開したらzipは要らない
    await fs.promises.rm(zip, { force: true })
    const app = path.join(out, `${APP_NAME}.app`)
    if ((await readPlistValue(app, 'CFBundleIdentifier')) !== bundleId) {
      throw new UpdateError('The downloaded zip does not contain BoostRecord.')
    }
    // 古いzipを付け間違えた時に、「更新」して古くなるのを防ぐ
    if ((await readPlistValue(app, 'CFBundleShortVersionString')) !== version) {
      throw new UpdateError('The downloaded app is not version %s.', version)
    }
    // ad-hoc署名では、壊れていないことしか分からない（誰が署名したかは確かめられない）
    if (
      !(await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]))
        .ok
    ) {
      throw new UpdateError('The downloaded app failed the signature check.')
    }
    return { work, app, version }
  } catch (err) {
    await fs.promises.rm(work, { recursive: true, force: true })
    throw err
  }
}

// 展開したアプリを、動いているアプリの場所に入れ替える。
// renameはボリュームをまたぐと失敗するので、先に置き換え先と同じ親ディレクトリへコピーする
async function replaceApp(staged, targetAppPath) {
  const parent = path.dirname(targetAppPath)
  const tag = `${process.pid}-${Date.now()}`
  const incoming = path.join(parent, `.${APP_NAME}-update-${tag}.app`)
  const backup = path.join(parent, `.${APP_NAME}-old-${tag}.app`)

  if (!(await canWriteParent(targetAppPath))) {
    throw new UpdateError('No permission to write to %s.', parent)
  }

  if (!(await run('/usr/bin/ditto', [staged.app, incoming])).ok) {
    await fs.promises.rm(incoming, { recursive: true, force: true })
    throw new UpdateError('Could not copy the new app into %s.', parent)
  }
  try {
    await fs.promises.rename(targetAppPath, backup)
  } catch (err) {
    await fs.promises.rm(incoming, { recursive: true, force: true })
    throw new UpdateError(
      'Could not replace %s (%s).',
      targetAppPath,
      err.code || err.message
    )
  }
  try {
    await fs.promises.rename(incoming, targetAppPath)
  } catch (err) {
    // ここで止まるとアプリが無い状態になるので、退避したものを戻す
    await fs.promises.rename(backup, targetAppPath).catch(() => {})
    await fs.promises.rm(incoming, { recursive: true, force: true })
    throw new UpdateError(
      'Could not replace %s (%s).',
      targetAppPath,
      err.code || err.message
    )
  }
  await discardStaged(staged)
  return backup
}

// 自分のプロセスが終わってから開き直す。先に開くと単一起動のロックで新しいほうが閉じる。
// Electronは終了に数秒かかることがあるので、決まった秒数ではなくPIDが消えるのを待つ。
// 60秒待っても終わらなければ、動いているものを消さないよう何もせずに抜ける。
// 退避した旧アプリも、終了するまでヘルパーの起動に使われうるので、終わってから消す。
// パスは引数で渡す。文字列に埋め込むと空白や引用符を含むパスで壊れる
const RELAUNCH_SCRIPT = [
  'i=0',
  'while /bin/kill -0 "$2" 2>/dev/null; do',
  '  i=$((i+1)); [ "$i" -gt 300 ] && exit 1',
  '  /bin/sleep 0.2',
  'done',
  '/bin/rm -rf "$1"',
  '/usr/bin/open "$0"'
].join('\n')

function relaunchAfterExit(appPath, backupPath) {
  const child = spawn(
    '/bin/sh',
    ['-c', RELAUNCH_SCRIPT, appPath, backupPath, String(process.pid)],
    { detached: true, stdio: 'ignore' }
  )
  child.unref()
}

module.exports = {
  downloadAndVerify,
  replaceApp,
  relaunchAfterExit,
  canWriteParent,
  discardStaged,
  UpdateError
}

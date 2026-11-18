// macOSのアプリ内更新で、zipを取ってきて確かめ、終了後に.appを置き換える部分。
// 開発元の署名（Developer ID）が無いアドホック署名なので、Squirrel／electron-updaterは
// 更新を適用できない。そのため置き換えを自前で行う。
// 判定はupdate-check.jsの純粋な関数に寄せ、ここは通信とファイル操作だけを持つ。
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFile, spawn } = require('child_process')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const { expectedSha512 } = require('./update-check')

const USER_AGENT = 'boostrecord-update-check'

class UpdateError extends Error {}

function run(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(String(stdout))
    })
  })
}

function plistValue(plistPath, key) {
  return run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plistPath])
    .then(s => s.trim())
    .catch(() => null)
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
  if (!res.ok || !res.body) {
    throw new UpdateError(`ダウンロードできませんでした（HTTP ${res.status}）`)
  }
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest))
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
  if (!res.ok)
    throw new UpdateError(
      `latest-mac.ymlを読めませんでした（HTTP ${res.status}）`
    )
  return res.text()
}

async function sha512Base64(file) {
  const hash = crypto.createHash('sha512')
  await pipeline(fs.createReadStream(file), hash)
  return hash.digest('base64')
}

// zipを取ってきて展開し、中身がこのアプリの指定のバージョンであることを確かめる。
// 確かめずに置くと、Releaseの添付を取り違えたときに別物で上書きしてしまう。
// 返すworkDirは置き換えが済むまで消さない（置き換えの処理が中の.appを使う）
async function prepare({ zip, ymlUrl, version, appPath }) {
  const bundleId = await plistValue(
    path.join(appPath, 'Contents/Info.plist'),
    'CFBundleIdentifier'
  )
  // 自分のIDが分からなければ、取ってきた中身が同じアプリかを確かめられない
  if (!bundleId)
    throw new UpdateError('このアプリのバンドルIDを読めませんでした')

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boostrecord-update-'))
  try {
    const zipPath = path.join(workDir, zip.name)
    await download(zip.url, zipPath)

    // 添付のymlに載っていれば、中身が途中で欠けていないかをsha512で確かめる。
    // ymlがある・読めるのに合わないときは、壊れたzipとみなして止める
    if (ymlUrl) {
      const expected = expectedSha512(
        await fetchText(ymlUrl),
        zip.name,
        version
      )
      if (expected && expected !== (await sha512Base64(zipPath))) {
        throw new UpdateError(
          'ダウンロードしたzipがlatest-mac.ymlの内容と合いません'
        )
      }
    }

    const extractDir = path.join(workDir, 'extract')
    fs.mkdirSync(extractDir)
    try {
      await run('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir])
    } catch (e) {
      throw new UpdateError('zipを展開できませんでした')
    }
    fs.unlinkSync(zipPath)

    const stagedApp = path.join(extractDir, 'BoostRecord.app')
    const plist = path.join(stagedApp, 'Contents/Info.plist')
    if (!fs.existsSync(plist)) {
      throw new UpdateError('zipの中にBoostRecord.appがありません')
    }
    if ((await plistValue(plist, 'CFBundleIdentifier')) !== bundleId) {
      throw new UpdateError('zipの中身がBoostRecordではありません')
    }
    if ((await plistValue(plist, 'CFBundleShortVersionString')) !== version) {
      throw new UpdateError(`zipの中身のバージョンが${version}ではありません`)
    }
    try {
      await run('/usr/bin/codesign', [
        '--verify',
        '--deep',
        '--strict',
        stagedApp
      ])
    } catch (e) {
      throw new UpdateError('zipの中のアプリの署名を確かめられませんでした')
    }
    return { workDir, stagedApp }
  } catch (e) {
    fs.rmSync(workDir, { recursive: true, force: true })
    throw e
  }
}

// 終了を待ってから置き換えて開き直す処理。動いている自分自身は置き換えられないので、
// アプリから切り離したシェルに任せる。置き換えに失敗したら退避した元の.appを戻して開く。
// 引数は順に、終了を待つpid、置き換える.app、新しい.app、作業用ディレクトリ、
// 開き直すときにopenへ渡す追加の引数（自動の更新では-gで前に出さない）
const SWAP_SCRIPT = `#!/bin/sh
pid="$1"; target="$2"; new="$3"; work="$4"; openflag="$5"
case "$target" in
  /*.app) ;;
  *) echo "置き換え先が.appではない: $target"; exit 2 ;;
esac
[ -d "$new" ] || { echo "新しい.appが無い: $new"; exit 2; }
backup="$work/previous.app"

# 60秒待っても終わらなければ、動いているアプリを置き換えないよう何もしない
i=0
while kill -0 "$pid" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 600 ]; then echo "終了を待ちきれなかった"; exit 1; fi
  sleep 0.1
done

if ! mv "$target" "$backup"; then
  echo "元の.appを退避できなかった"
  open "$target"
  exit 1
fi
if mv "$new" "$target"; then
  echo "置き換えた: $target"
  rm -rf "$work"
  open $openflag "$target"
  exit 0
fi
echo "置き換えに失敗したので元に戻す"
rm -rf "$target"
mv "$backup" "$target"
open "$target"
rm -rf "$work"
exit 1
`

// 置き換えの処理を切り離して走らせる。呼んだ側はこの後すぐにアプリを終了する
function launchSwap({ workDir, stagedApp, appPath, pid, background, logPath }) {
  const script = path.join(workDir, 'swap.sh')
  fs.writeFileSync(script, SWAP_SCRIPT, { mode: 0o755 })
  const out = fs.openSync(logPath, 'a')
  const child = spawn(
    '/bin/sh',
    [script, String(pid), appPath, stagedApp, workDir, background ? '-g' : ''],
    {
      detached: true,
      stdio: ['ignore', out, out],
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }
    }
  )
  child.unref()
  fs.closeSync(out)
}

module.exports = { prepare, launchSwap, UpdateError, SWAP_SCRIPT }

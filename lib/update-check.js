// Version comparison for the GitHub release update check (see main-app.js).
// Extracted so the logic is unit-testable outside the Electron main process.
function isNewerVersion(latest, current) {
  const a = String(latest)
    .split('.')
    .map(Number)
  const b = String(current)
    .split('.')
    .map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

// Which installer the update notice should open. Opening the release page
// made users pick from 3 files every update, and an arm64 dmg installed on an
// Intel Mac shows a 🚫 icon and never launches. Pick the asset that matches
// the running platform/arch; return null so the caller can fall back to the
// release page when nothing matches (unknown platform, renamed assets, ...).
function pickDownloadUrl(release, platform, arch) {
  const assets = release && Array.isArray(release.assets) ? release.assets : []
  let matches
  if (platform === 'darwin') {
    // BoostRecord-<ver>-arm64.dmg / BoostRecord-<ver>-x64.dmg
    const suffix = `-${arch}.dmg`
    matches = name => name.startsWith('BoostRecord-') && name.endsWith(suffix)
  } else if (platform === 'win32') {
    // BoostRecord-Setup-<ver>.exe (x64 only; runs emulated on Windows on ARM)
    matches = name => /^BoostRecord-Setup-.*\.exe$/.test(name)
  } else {
    return null
  }
  const asset = assets.find(
    a => a && typeof a.name === 'string' && matches(a.name)
  )
  return asset && asset.browser_download_url ? asset.browser_download_url : null
}

// The CPU to download for. An x64 build running under Rosetta reports
// process.arch 'x64' on an Apple Silicon Mac (e.g. after Migration Assistant
// carried it over from an Intel Mac); offer the native arm64 build there.
function hostArch(processArch, runningUnderARM64Translation) {
  return runningUnderARM64Translation ? 'arm64' : processArch
}

// ここから下はmacOSのアプリ内更新（lib/app-updater.js）の判定。通信・ファイル操作・
// 画面から切り離し、テストで決め事を固定する。

// 「更新の方法」。保存値が無い・読めないときは確認に倒す。黙って置き換わるより、
// 聞かれるほうが利用者の予想から外れにくい
const UPDATE_MODES = ['confirm', 'auto']
function normalizeUpdateMode(value) {
  return value === 'auto' ? 'auto' : 'confirm'
}

function findAsset(release, name) {
  const assets = release && Array.isArray(release.assets) ? release.assets : []
  const asset = assets.find(a => a && a.name === name)
  return asset && typeof asset.browser_download_url === 'string'
    ? asset.browser_download_url
    : null
}

// アプリ内更新で取ってくるzip。名前はpackage.jsonのartifactNameと同じ
// 「BoostRecord-<バージョン>-<arch>.zip」に完全一致で合わせる。前方一致にすると、
// 添付を差し替え忘れた古いzipを拾って、確かめる段階でようやく失敗する
function pickUpdateZip(release, version, arch) {
  if (!version || (arch !== 'arm64' && arch !== 'x64')) return null
  const name = `BoostRecord-${version}-${arch}.zip`
  const url = findAsset(release, name)
  return url ? { name, url } : null
}

// releases/latestの応答から、更新に要るものだけを抜き出す。下書きと先行リリースは
// 対象にしない（latestは本来返さないが、APIの応答を信じ切らない）
function parseRelease(release, platform, arch) {
  if (!release || release.draft || release.prerelease) return null
  const version = String(release.tag_name || '').replace(/^v/, '')
  if (!/^\d+(\.\d+)*$/.test(version)) return null
  const pageUrl = typeof release.html_url === 'string' ? release.html_url : null
  const zip =
    platform === 'darwin' ? pickUpdateZip(release, version, arch) : null
  return {
    version,
    pageUrl,
    downloadUrl: pickDownloadUrl(release, platform, arch) || pageUrl,
    zip,
    ymlUrl: platform === 'darwin' ? findAsset(release, 'latest-mac.yml') : null
  }
}

// latest-mac.yml（electron-builderが書く）からzipのsha512を引く。
// 照合できないとき（ymlが読めない・バージョンが違う・zipが載っていない）はnullを返し、
// 呼び出し側はバンドルIDとバージョンと署名の確認だけで進める
function expectedSha512(ymlText, zipName, version) {
  let doc
  try {
    doc = require('js-yaml').load(String(ymlText || ''))
  } catch (e) {
    return null
  }
  if (!doc || typeof doc !== 'object') return null
  if (version && String(doc.version) !== String(version)) return null
  const files = Array.isArray(doc.files) ? doc.files : []
  const entry = files.find(f => f && f.url === zipName)
  if (!entry || typeof entry.sha512 !== 'string' || !entry.sha512) return null
  return entry.sha512
}

// 新しいバージョンが見つかったときにどうするか。
// manualはメニューの「更新を確認」から。自分で確かめに行ったので、方法によらず聞く。
// canInstallはアプリ内で置き換えられるか（macOSでzipがあり、書き込める場所にある）
function updateAction({ mode, manual, canInstall, alreadyPrompted }) {
  if (manual) return 'prompt'
  if (normalizeUpdateMode(mode) === 'auto' && canInstall) return 'install'
  // 自動でも置き換えられなければ、確認と同じくバージョンごとに1回だけ聞く。
  // 毎回出すと閉じるだけの操作になり、知らせとして効かなくなる
  return alreadyPrompted ? 'none' : 'prompt'
}

// 自動の更新で、操作が止まってから開き直すまでに待つ長さ（秒）
const AUTO_INSTALL_IDLE_SECONDS = 5 * 60

// 開き直してよいか。止める理由を返し、よければnullを返す。
// replyは画面側の答え（{ dirty, modalOpen }）。答えが無いのは、画面が同期の
// ダイアログで止まっているか固まっているときなので、開き直さない
function restartBlocker({ auto, reply, idleSeconds }) {
  if (!reply) return 'no-answer'
  // 保存していない編集が残っている。ノートを失わないことを何より優先する
  if (reply.dirty) return 'unsaved'
  // AIの差分や相談の窓、設定の画面などは、閉じると書きかけが消える
  if (reply.modalOpen) return 'modal'
  if (auto && !(idleSeconds >= AUTO_INSTALL_IDLE_SECONDS)) return 'active'
  return null
}

// 実行中の.appの場所。execPathは<app>/Contents/MacOS/<実行ファイル>
function appBundlePath(execPath) {
  const parts = String(execPath || '').split('/')
  if (parts.length < 4) return null
  const app = parts.slice(0, -3).join('/')
  return app.endsWith('.app') ? app : null
}

// その場所で置き換えてよいか。dmgの中（/Volumes）や、Gatekeeperが隔離して
// 読み取り専用の場所から動かしているとき（AppTranslocation）は置き換えられない
function canReplaceAt(appPath) {
  if (!appPath || !appPath.startsWith('/') || !appPath.endsWith('.app')) {
    return false
  }
  if (appPath.startsWith('/Volumes/')) return false
  if (appPath.includes('/AppTranslocation/')) return false
  return true
}

// 開き直した後に、前回の更新がどうなったか。pendingは置き換えの前に残した
// { version, auto }。バージョンが変わっていなければ、置き換えに失敗して元に戻っている
function postInstallResult(pending, currentVersion) {
  if (!pending || typeof pending !== 'object' || !pending.version) return null
  const installed = String(pending.version) === String(currentVersion)
  return {
    kind: installed ? 'installed' : 'failed',
    auto: !!pending.auto,
    version: String(pending.version)
  }
}

module.exports = {
  isNewerVersion,
  pickDownloadUrl,
  hostArch,
  UPDATE_MODES,
  normalizeUpdateMode,
  pickUpdateZip,
  parseRelease,
  expectedSha512,
  updateAction,
  AUTO_INSTALL_IDLE_SECONDS,
  restartBlocker,
  appBundlePath,
  canReplaceAt,
  postInstallResult
}

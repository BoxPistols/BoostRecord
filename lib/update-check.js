// Version comparison for the GitHub release update check (see main-app.js).
// Extracted so the logic is unit-testable outside the Electron main process.

// 数字と.だけのバージョンを配列にする。-betaなど数字以外が混じるものはnullにして、
// 「新しいバージョンがある」と言わない側に倒す（出し続けるより出さないほうが害が小さい）
function parseVersion(v) {
  const s = String(v == null ? '' : v).replace(/^v/, '')
  if (!/^\d+(\.\d+)*$/.test(s)) return null
  return s.split('.').map(Number)
}

function compareParsed(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function isNewerVersion(latest, current) {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  return compareParsed(a, b) > 0
}

// Releaseの一覧から、旧アプリのものの中で最も新しいものを選ぶ。
// 同じリポジトリにapp/（app-v*）のReleaseも出すので、releases/latestに頼ると
// そちらがLatestになった時に旧アプリの更新が隠れる。一覧は作成日の順なので、バージョンで比べる
function pickLatestRelease(releases) {
  if (!Array.isArray(releases)) return null
  let best = null
  let bestVersion = null
  for (const r of releases) {
    if (!r || r.draft || r.prerelease) continue
    if (!/^v\d+(\.\d+)*$/.test(String(r.tag_name))) continue
    const v = parseVersion(r.tag_name)
    if (!bestVersion || compareParsed(v, bestVersion) > 0) {
      best = r
      bestVersion = v
    }
  }
  return best
}

// 確認の結果を3つに分ける。失敗を「最新」と同じに扱うと、通信が一度落ちただけで
// 知っている更新の知らせが消え、確認の時刻も進んで丸1日確かめ直さなくなる
function classifyUpdateResponse(status, body, currentVersion) {
  // 404はReleaseがまだ1つも無い状態なので最新として扱う
  if (status === 404) return { kind: 'latest' }
  if (status !== 200 || !Array.isArray(body)) return { kind: 'failed' }
  const release = pickLatestRelease(body)
  if (!release) return { kind: 'latest' }
  const version = String(release.tag_name).replace(/^v/, '')
  if (isNewerVersion(version, currentVersion)) {
    return { kind: 'available', release, version }
  }
  return { kind: 'latest' }
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

// 24時間おきのタイマーはスリープを挟むと当てにならないので、1時間ごとに
// 「前回の成功から24時間たったか」を見る。前回の時刻は成功した時だけ進める
function shouldCheckNow(lastSuccessAt, now) {
  const last = Number(lastSuccessAt)
  if (!Number.isFinite(last) || last <= 0) return true
  // 時計が戻された時に永久に確認しなくなるのを防ぐ
  if (now < last) return true
  return now - last >= CHECK_INTERVAL_MS
}

// ポップアップは同じバージョンにつき1回だけ。毎回出すと閉じるだけの操作になる。
// 手で確認した時は出したことがあっても出す
function shouldNotify(version, notifiedVersion, manual) {
  return Boolean(manual) || version !== notifiedVersion
}

// 自分で置き換えてよい場所か。DMGから直接開いている、隔離されたまま
// App Translocationの読み取り専用の場所で動いている、.appの中でない時は置き換えない
function selfReplaceBlocker(appPath, platform) {
  if (platform !== 'darwin') return 'platform'
  const p = String(appPath || '')
  if (!p.endsWith('.app')) return 'not-app-bundle'
  if (p.startsWith('/Volumes/')) return 'disk-image'
  if (p.includes('/AppTranslocation/')) return 'translocated'
  return null
}

// 動いている実行ファイルのパスから.appのパスを求める
// （<app>.app/Contents/MacOS/<name> の3つ上）
function appBundlePath(execPath) {
  const parts = String(execPath || '').split('/')
  if (parts.length < 4) return ''
  return parts.slice(0, -3).join('/')
}

// 置き換えに使うzip。dmgはマウントが要るので、展開だけで済むzipを使う
function pickZipAsset(release, arch) {
  const assets = release && Array.isArray(release.assets) ? release.assets : []
  const suffix = `-${arch}.zip`
  const asset = assets.find(
    a =>
      a &&
      typeof a.name === 'string' &&
      a.name.startsWith('BoostRecord-') &&
      a.name.endsWith(suffix)
  )
  return asset && asset.browser_download_url ? asset.browser_download_url : null
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

module.exports = {
  parseVersion,
  isNewerVersion,
  pickLatestRelease,
  classifyUpdateResponse,
  shouldCheckNow,
  shouldNotify,
  selfReplaceBlocker,
  appBundlePath,
  pickZipAsset,
  pickDownloadUrl,
  hostArch,
  CHECK_INTERVAL_MS
}

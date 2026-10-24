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

module.exports = { isNewerVersion, pickDownloadUrl, hostArch }

// electron-builder afterPack hook: deep ad-hoc sign the mac app.
//
// With `identity: null` electron-builder skips signing entirely, leaving the
// Electron binary's linker signature over a MODIFIED bundle — an INVALID
// seal. Quarantined downloads of such an app get macOS's "damaged, move to
// trash" dialog, recoverable only via `xattr -cr` in a terminal. A valid
// (deep) ad-hoc signature downgrades that to the standard "unidentified
// developer" dialog, which users clear with right-click > Open — no
// terminal. Real Developer ID signing + notarization supersedes this later.
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit'
  })
  console.log(`  • ad-hoc signed (deep)  app=${appPath}`)
}

// Dev launcher for the Vite-era renderer.
//
// Boostnote's original webpack-1 dev server was retired: webpack 1.x's acorn
// cannot parse the ES2018+ syntax that the modernized dependency tree now ships
// (fs-extra 11, highlight.js 11, …), so bundling those deps blows up with
// "Unexpected token". Production already builds with Vite 6 (`npm run compile`),
// so dev reuses that exact pipeline in watch mode instead:
//
//   - `vite build --watch` rebuilds compiled/main.js + compiled/main.css on
//     every save (same artifact contract as the production build).
//   - Electron is launched WITHOUT the legacy `--hot` flag, so the renderer's
//     HTML loads ../compiled/main.js (the built bundle). The old `--hot` path
//     pointed at the webpack dev server on localhost:8080 and is now unused.
//   - lib/main-window.js watches compiled/main.js (dev only) and reloads the
//     window after each rebuild: save → rebuild → auto-reload. This is the
//     modern replacement for the retired webpack-dev-server HMR.

const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const electron = require('electron')
const signale = require('signale')

const root = path.join(__dirname, '..')
const isWin = process.platform === 'win32'
const viteBin = path.join(
  root,
  'node_modules',
  '.bin',
  isWin ? 'vite.cmd' : 'vite'
)
const bundlePath = path.join(root, 'compiled', 'main.js')

let launched = false
let electronProc = null

// Remove the previous bundle so its (re)appearance is an unambiguous signal that
// the first watch build has finished — then we launch Electron against it.
try {
  fs.unlinkSync(bundlePath)
} catch (e) {
  // no prior build — fine
}

// Vite in watch mode, same config as `npm run compile`. stdio inherited so the
// developer sees Vite's build output and any bundle errors directly.
const vite = spawn(
  viteBin,
  ['build', '--config', 'vite.renderer.config.mjs', '--watch'],
  { cwd: root, stdio: 'inherit', env: process.env, shell: isWin }
)
vite.on('error', err => {
  signale.error(err)
  process.exit(1)
})

signale.watch(
  'Building renderer with Vite (watch)… waiting for compiled/main.js'
)

let waited = 0
const poll = setInterval(() => {
  if (launched) return
  waited += 250
  let ready = false
  try {
    ready = fs.statSync(bundlePath).size > 0
  } catch (e) {
    ready = false
  }
  if (ready) {
    launched = true
    clearInterval(poll)
    signale.success('Initial renderer bundle built (compiled/main.js)')
    startElectron()
  } else if (waited === 45000) {
    signale.warn(
      'Renderer still building after 45s — check the Vite output above for errors.'
    )
  }
}, 250)

function startElectron() {
  // Electron (BoringSSL) refuses --openssl-legacy-provider and won't start if it
  // inherits it; strip it from the child env in case the environment sets it.
  const env = { ...process.env, NODE_ENV: 'development' }
  if (env.NODE_OPTIONS) {
    env.NODE_OPTIONS = env.NODE_OPTIONS.replace(
      /--openssl-legacy-provider/g,
      ''
    ).trim()
    if (!env.NODE_OPTIONS) delete env.NODE_OPTIONS
  }

  // '.' (not './index.js') so app.getVersion() reports the app version rather
  // than Electron's own. No --hot: the renderer loads ../compiled/main.js.
  electronProc = spawn(electron, ['.'], { stdio: 'inherit', env })
  signale.success('Electron started')

  const shutdown = () => {
    try {
      vite.kill()
    } catch (e) {}
    process.exit(0)
  }
  electronProc.on('close', shutdown)
  electronProc.on('error', err => {
    signale.error(err)
    shutdown()
  })
}

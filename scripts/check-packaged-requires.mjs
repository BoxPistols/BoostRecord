#!/usr/bin/env node
// Guard against the "works in dev, broken when packaged" failure mode:
// the Vite renderer bundle leaves bare imports as runtime require()s, and
// electron-builder prunes devDependencies — so a runtime dep accidentally
// declared in devDependencies ships a broken app (e.g. react-css-modules
// in v0.16.3 left the packaged renderer stuck on the splash screen).
//
// Usage: node scripts/check-packaged-requires.mjs [appResourcesDir...]
// Default: checks the mac/win unpacked apps under release/.
import fs from 'node:fs'
import path from 'node:path'
import { builtinModules } from 'node:module'

const root = path.dirname(new URL(import.meta.url).pathname) + '/..'
const candidates = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      `${root}/release/mac-arm64/The Boosters.app/Contents/Resources/app`,
      `${root}/release/mac/The Boosters.app/Contents/Resources/app`,
      `${root}/release/win-unpacked/resources/app`
    ]

const apps = candidates.filter(p => fs.existsSync(p))
if (apps.length === 0) {
  console.error(
    'check-packaged-requires: no packaged app found. Run electron-builder first.'
  )
  process.exit(2)
}

const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`)
])

// These are required behind a NODE_ENV === 'development' guard in lib/, so
// they may legally be absent from the packaged (production) app.
const DEV_ONLY = new Set([
  'electron-devtools-installer',
  'electron-debug',
  'devtron'
])

function collectRequires(file) {
  const src = fs.readFileSync(file, 'utf8')
  const re = /require\((?:'|")([^'")]+)(?:'|")\)/g
  const mods = new Set()
  let m
  while ((m = re.exec(src))) {
    const id = m[1]
    if (id.startsWith('.') || id.startsWith('/')) continue
    if (builtins.has(id) || id === 'electron') continue
    const parts = id.split('/')
    mods.add(id.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0])
  }
  return mods
}

let failed = false
for (const app of apps) {
  const sources = [`${app}/compiled/main.js`, `${app}/index.js`]
  for (const f of fs.readdirSync(`${app}/lib`).filter(f => f.endsWith('.js'))) {
    sources.push(`${app}/lib/${f}`)
  }
  if (fs.existsSync(`${app}/lib/ai`)) {
    for (const f of fs
      .readdirSync(`${app}/lib/ai`)
      .filter(f => f.endsWith('.js'))) {
      sources.push(`${app}/lib/ai/${f}`)
    }
  }

  const missing = new Set()
  for (const file of sources.filter(f => fs.existsSync(f))) {
    for (const mod of collectRequires(file)) {
      if (DEV_ONLY.has(mod)) continue
      if (!fs.existsSync(`${app}/node_modules/${mod}`)) missing.add(mod)
    }
  }

  if (missing.size) {
    failed = true
    console.error(`FAIL ${app}`)
    for (const m of [...missing].sort()) {
      console.error(`  MISSING at runtime: ${m} (move it to "dependencies"?)`)
    }
  } else {
    console.log(`OK ${app} — all runtime requires resolve`)
  }
}

process.exit(failed ? 1 : 0)

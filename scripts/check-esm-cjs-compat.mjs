#!/usr/bin/env node
/**
 * ESM/CJS compatibility check.
 *
 * babel-plugin-add-module-exports patches require(esm-default) to return the
 * default value directly, so Jest and webpack-dev pass even when a module uses
 * `export default {}` but a consumer does `require(mod).method`.  Vite/Rollup
 * does NOT apply that patch, so the same code breaks in the built app.
 *
 * This script detects: require() of a browser/ module that has ONLY
 * `export default` and no named exports — the only pattern that breaks.
 *
 * Exit 1 if any mismatch is found.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const browserDir = join(root, 'browser')

// ── helpers ────────────────────────────────────────────────────────────────

function readFile(p) {
  try { return readFileSync(p, 'utf8') } catch { return '' }
}

function walk(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) results.push(...walk(full))
    else if (full.endsWith('.js')) results.push(full)
  }
  return results
}

// Returns true if a file uses `export default` as its ONLY export mechanism
// (no named `export function foo` / `export const foo` / `export { foo }`).
function isEsmDefaultOnly(src) {
  const hasDefault = /^export default\b/m.test(src)
  if (!hasDefault) return false
  // named: export function/class/const/let/var/{ but NOT "export default"
  const hasNamed = /^export\s+(?!default\b)(?:function|class|const|let|var|\{)/m.test(src)
  return !hasNamed
}

// Resolve a bare-ish require path to an absolute file path relative to importer.
function resolveRequire(reqPath, importerFile) {
  if (!reqPath.startsWith('browser/') && !reqPath.startsWith('.')) return null
  let abs
  if (reqPath.startsWith('browser/')) {
    abs = join(root, reqPath)
  } else {
    abs = join(dirname(importerFile), reqPath)
  }
  if (!abs.endsWith('.js')) abs += '.js'
  return abs
}

// ── main ───────────────────────────────────────────────────────────────────

const files = walk(browserDir)

// Pre-build "is this file ESM-default-only?" map
const esmDefaultOnly = new Map()
for (const f of files) {
  esmDefaultOnly.set(f, isEsmDefaultOnly(readFile(f)))
}

const REQUIRE_RE = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g
const errors = []

// Check 1: a file containing a top-level `import` is parsed as ESM, so a
// `module.exports =` assignment in the SAME file is silently dropped by the
// Vite build — the module ends up exporting nothing (this is how
// dataApi.moveNote became undefined at runtime while Jest/AVA kept passing).
for (const file of files) {
  const src = readFile(file)
  if (/^import\s/m.test(src) && /^module\.exports\s*=/m.test(src)) {
    const rel = file.replace(root + '/', '')
    errors.push(
      `  ${rel}\n    → mixes top-level "import" with "module.exports =" — the export is silently dropped by Vite; use "export default" instead`
    )
  }
}

for (const file of files) {
  const src = readFile(file)
  // Skip files that don't use require() at all
  if (!src.includes('require(')) continue

  for (const match of src.matchAll(REQUIRE_RE)) {
    const [fullMatch, reqPath] = match
    // Only care about internal browser/ or relative imports
    if (!reqPath.startsWith('browser/') && !reqPath.startsWith('.')) continue

    const target = resolveRequire(reqPath, file)
    if (!target) continue
    if (!esmDefaultOnly.get(target)) continue

    // Safe pattern 1: caller already accesses .default explicitly.
    const afterRequire = src.slice(match.index + fullMatch.length, match.index + fullMatch.length + 10)
    if (afterRequire.trimStart().startsWith('.default')) continue

    // Safe pattern 2: side-effect-only require (result not assigned / used).
    // Line starts with optional whitespace then 'require(' — no assignment.
    const lineStart = src.lastIndexOf('\n', match.index) + 1
    const lineText = src.slice(lineStart, match.index).trimStart()
    if (lineText === '' || lineText === '// eslint-disable-next-line global-require\n'.trimStart()) continue

    // Found: a require() of a browser/ module that only has export default.
    // In Vite builds this returns { default: {...} }, so .method is undefined.
    const rel = file.replace(root + '/', '')
    const trel = target.replace(root + '/', '')
    errors.push(`  ${rel}\n    → require('${reqPath}') but ${trel} uses only "export default"`)
  }
}

if (errors.length === 0) {
  console.log('✓ ESM/CJS compat: no require() of ESM-default-only modules found')
  process.exit(0)
} else {
  console.error('✗ ESM/CJS mismatch detected — these break in the Vite production build:')
  console.error('  (babel-plugin-add-module-exports masks this in Jest/webpack dev)')
  console.error('')
  for (const e of errors) console.error(e)
  console.error('\nFix: change require() to "import X from \'…\'" in the consumer file.')
  process.exit(1)
}

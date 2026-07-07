#!/usr/bin/env node
/**
 * Pre-release gate for The Boosters.
 * Runs all CI checks locally in sequence, fast-failing on first error.
 *
 * Usage: npm run pre-release   (or: node scripts/pre-release-check.mjs)
 * Node: 22 (pnpm/modern toolchain — same as CI)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const isWin = process.platform === 'win32'

// Spawn a command, stream output live, return exit code.
function run(label, cmd, args) {
  const bar = '─'.repeat(Math.max(0, 50 - label.length))
  process.stdout.write(`\n┌─ ${label} ${bar}\n`)
  const r = spawnSync(isWin ? `${cmd}.cmd` : cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin
  })
  const ok = r.status === 0 && r.error == null
  console.log(ok ? `└─ ✓ ${label}\n` : `└─ ✗ ${label} — FAILED (exit ${r.status})\n`)
  return ok
}

console.log('\n╔══════════════════════════════════════╗')
console.log('║  The Boosters — pre-release checks   ║')
console.log('╚══════════════════════════════════════╝')

const steps = [
  ['ESM/CJS compat', 'node', ['scripts/check-esm-cjs-compat.mjs']],
  ['Lint (0 errors)', 'pnpm', ['run', 'lint']],
  ['AVA — data layer', 'pnpm', ['run', 'ava']],
  ['Jest — components + lib', 'pnpm', ['run', 'jest']],
  ['Vite production build', 'pnpm', ['run', 'compile']]
]

let allPassed = true

for (const [label, cmd, args] of steps) {
  if (!run(label, cmd, args)) {
    allPassed = false
    break
  }
}

// Post-build: assert bundle exists and is not suspiciously small.
if (allPassed) {
  const bundle = join(root, 'compiled', 'main.js')
  process.stdout.write('\n┌─ Bundle integrity ─────────────────────────────\n')
  if (!existsSync(bundle)) {
    console.error('└─ ✗ compiled/main.js not found\n')
    allPassed = false
  } else {
    const bytes = statSync(bundle).size
    const mb = (bytes / 1024 / 1024).toFixed(2)
    if (bytes < 500_000) {
      console.error(`└─ ✗ Bundle too small: ${mb} MB (expected >0.5 MB — build may be broken)\n`)
      allPassed = false
    } else {
      console.log(`└─ ✓ compiled/main.js  ${mb} MB\n`)
    }
  }
}

// E2E: boot the real app on the fresh bundle and drive the core note flow
// (create → type → save → note-list title). Catches "builds fine, breaks in
// the real renderer" failures that unit tests structurally cannot see.
if (allPassed) {
  allPassed = run('E2E — real renderer note flow', 'pnpm', ['run', 'e2e'])
}

// Summary
console.log('═'.repeat(42))
if (allPassed) {
  console.log('✅  All checks passed. Safe to release.\n')
  process.exit(0)
} else {
  console.log('❌  Pre-release checks FAILED. Fix the error above.\n')
  process.exit(1)
}

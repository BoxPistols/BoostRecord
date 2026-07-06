---
name: boostnote-fix
description: Bug fix workflow for The Boosters legacy app. Load before diagnosing any runtime crash, CI failure, or UI regression. Contains symptom-by-symptom diagnosis checklist, known failure patterns, and commit protocol.
---

# The Boosters — Bug Fix Workflow

## When to load this skill
Any bug report, runtime crash, CI failure, or unexpected behavior in the legacy
app (`browser/` + `lib/`, Electron 28, Vite 6 renderer).

---

## 1. Reproduce before touching code

```bash
ELECTRON_ENABLE_LOGGING=1 ~/.volta/bin/volta run --node 14.21.3 npm run dev
```

Note the error category, then pick the matching diagnosis path below.

---

## 2. Diagnosis by symptom

### `X is not a function` / `undefined is not a function` in renderer

**Root cause: ESM/CJS mismatch.** Classic pattern:
- Module A: `export default { methodX }` (ESM-only, no named exports)
- Consumer B: `const A = require('./A')` then calls `A.methodX()`
- In Vite build: `require(ESM-default-module)` returns `{ default: {...} }` → `A.methodX` is `undefined`
- In Jest / webpack-dev: `babel-plugin-add-module-exports` patches this → tests pass, app crashes

**Diagnosis:**
```bash
node scripts/check-esm-cjs-compat.mjs
```
If any mismatch is reported, fix each listed file: change `require()` → `import X from '...'`.

**Verify fix:**
```bash
node scripts/check-esm-cjs-compat.mjs   # must exit 0
pnpm run compile                          # build must succeed
```

### App stuck on splash / infinite loading

Script tags in `lib/main.{development,production}.html` point to UMD files inside
`node_modules/`. A dep upgrade can silently change the UMD path.

Fixed historically: flowchart.js → pin `1.10.0` (#51), codemirror-mode-elixir
→ corrected UMD path (#56).

After any `npm update` or dep change: manually verify every `<script src="../node_modules/…">` resolves. Run `pnpm run compile` and open the app.

### Windows-only CI failure

Common causes (all in `vite.renderer.config.mjs`):
1. `new URL(import.meta.url).pathname` → on Windows adds a leading `/` (gives `/D:/…`). Use `fileURLToPath(import.meta.url)` instead.
2. Backslash in path strings used in Stylus `@import` → `\n` is interpreted as newline. Use `toSlash()` helper.
3. `external()` function only checked `source.startsWith('/')` → Windows absolute paths (`C:\…`) slipped through. Guard with `path.isAbsolute(source)`.

### Electron main process error (not renderer)

```bash
ELECTRON_ENABLE_LOGGING=1 npm run dev
```
Watch the **terminal** output (not DevTools), look for `[ERROR:…]` or Node stack traces.

### CI build failure — check logs

```bash
gh run list --limit 5
gh run view <run-id> --log-failed
```

---

## 3. Write a failing test first (when possible)

For any runtime crash with a clear API contract, add a test **before** fixing:

```js
// tests/lib/<module>-api.test.js
import myModule from 'browser/lib/myModule'
it('exports doThing as a function', () => {
  expect(typeof myModule.doThing).toBe('function')
})
```

Run `npm run jest` → confirm it fails → fix → confirm it passes.

---

## 4. Fix scope

- Edit the **minimum** set of files that address the root cause
- No opportunistic cleanup or refactoring
- Run `node scripts/check-esm-cjs-compat.mjs` if you touched any `import`/`require`
- Run `pnpm run compile` (must succeed)
- Run `~/.volta/bin/volta run --node 14.21.3 npm test` (all 244+ must pass)

---

## 5. Commit format

```
fix(<scope>): <imperative description in Japanese or English>

<root cause 1 line> + <fix applied 1 line>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Scope examples: `esm-cjs`, `renderer`, `electron`, `dataApi`, `spellcheck`, `windows`, `ci`

---

## 6. Release urgency

- **Crash on launch / data loss**: patch release immediately → load `/boostnote-release`
- **UI regression / partial breakage**: can batch with next minor
- **CI-only failure (app still runs)**: fix on feature branch, merge to main

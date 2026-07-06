---
name: boostnote-feature
description: Feature development workflow for The Boosters legacy app. Load before implementing any new capability. Covers legacy constraints, file placement rules, ESM/CJS discipline, and pre-commit checklist.
---

# The Boosters — Feature Development Workflow

## When to load this skill
Any new user-facing feature, UI change, new `browser/` module, or non-trivial
refactor in the legacy app.

---

## 1. Hard constraints

| Constraint | Current value | Do NOT change without a migration plan |
|---|---|---|
| Electron | 28.3.3 | Upgrading to 42 is a separate modernization track |
| React | 16.8 | No React 17+ APIs; functional components + hooks are fine |
| Renderer build | Vite 6 | webpack 1 remains for dev hot-reload only |
| Node (test/lint) | 14 via Volta | `~/.volta/bin/volta run --node 14.21.3 npm …` |
| Node (build/CI) | 22 via pnpm | `pnpm run compile`, `pnpm run lint` |
| CSS | Stylus + CSS Modules | no Tailwind, no styled-components |
| State | Redux (not Redux Toolkit yet) | store lives in `browser/main/store.js` |

**New dependencies:** add to `dependencies` (not `devDependencies`) if needed at
runtime in the renderer. Verify the UMD/CJS path in `lib/main.*.html` if the dep
is loaded via a `<script>` tag.

---

## 2. File placement

```
browser/
  components/    → React UI components (no direct Electron/Node deps)
  lib/           → Pure utilities, importable in tests without mocking Electron
  main/
    lib/dataApi/ → File-system CSON operations (uses sander/CSON, needs Node)
    modals/      → Modal dialogs
    Detail/      → Note detail panes (MarkdownNoteDetail, SnippetNoteDetail)
    lib/         → Electron-aware helpers (ConfigManager, aiAssist, etc.)
lib/             → Electron main-process code (IPC handlers, window management)
```

Rule: if the new module has zero Electron/Node deps → `browser/lib/`.
If it needs `@electron/remote` or file I/O → `browser/main/lib/`.

---

## 3. ESM/CJS rules (non-negotiable)

The Vite build is strict about ESM/CJS interop. **Always use `import` when the
target module uses `export default`** (no named exports). Using `require()` on
such a module in the Vite build returns `{ default: {...} }` — methods undefined.

To check whether a module is ESM-default-only: does it contain `export default`
but no `export function/const/let/var/{` at file scope?

After any `import`/`require` change:
```bash
node scripts/check-esm-cjs-compat.mjs   # must print ✓
```

---

## 4. Styling

- Class binding: `styleName="myClass"` (react-css-modules), NOT `className={styles.myClass}`
- Module file: `<ComponentName>.styl` alongside the component
- Dark/light theme vars: `browser/styles/variables.styl`
- Global base: `browser/styles/index.styl`

---

## 5. Test to write for each change type

| Change type | Where | Pattern |
|---|---|---|
| New `browser/lib/` module | `tests/lib/<module>-api.test.js` | `import X from '...'` + check method types |
| New React component | `tests/components/<Name>.test.js` | snapshot + props |
| New dataApi operation | `tests/dataApi/<op>.test.js` (AVA) | real tmp storage |
| Bug fix | Existing test file or new regression file | Test the specific broken case |
| AI / IPC feature | `tests/lib/aiIpc.test.js` (extend existing) | mock IPC channel |

---

## 6. Pre-commit checklist (run in order)

```bash
node scripts/check-esm-cjs-compat.mjs          # 0 mismatches
~/.volta/bin/volta run --node 14.21.3 npm run lint    # 0 errors
~/.volta/bin/volta run --node 14.21.3 npm test        # all pass
pnpm run compile                                # built in <10s, compiled/main.js >500KB
```

Or run everything at once:
```bash
npm run pre-release
```

---

## 7. Commit format

```
feat(<scope>): <imperative description>

<why this was added or changed>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Scope examples: `editor`, `spellcheck`, `ui`, `ai`, `dataApi`, `search`, `theme`

---

## 8. After merge

If the feature is user-visible: bump the patch or minor version and release.
→ Load `/boostnote-release`

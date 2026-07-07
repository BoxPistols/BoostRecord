---
name: boostnote-modernize
description: Architecture, decisions, and working rules for modernizing Boostnote into a modern, collaborative, extensible note app. Load this before working on the modernization (stack choices, the collab core, the dependency overhaul, deploy/ops, or the new-app shell). Benchmarks: Obsidian, HackMD.
---

# Boostnote Modernization — architect skill

Single source of truth for the rebuild. The legacy app is the discontinued
Boostnote (Electron 4 + React 16 + Redux + CodeMirror 5 + webpack 1, notes as
on-disk `.cson`). Goal: a **modern, high-performance, extensible** note app that
**inherits the existing UI/UX** as a baseline while exploring new concepts,
benchmarked against **Obsidian** (local-first, plugin ecosystem) and **HackMD**
(real-time collaborative markdown).

License: **GPL-3.0** (inherited from BoostIO). Any rebuild stays GPL-3.0.

## Locked architecture decisions (do not re-litigate)

| Layer | Decision | Why |
|---|---|---|
| Desktop shell | **Electron**, modernized to the latest supported major (v42 line) | reuse React UI + Node `.cson` I/O; mature mac+win signing/notarization/auto-update. Tauri 2 only as a later, optional footprint pass |
| Build | **Vite / electron-vite** (replacing webpack 1) | webpack 1 is unevolvable |
| UI framework | **React → 19** + Redux Toolkit (incremental) | maximal reuse of existing React assets |
| Editor core | **CodeMirror 6 + y-codemirror.next** (source markdown) | markdown string IS the CRDT payload (1:1 with `.cson`); preview pipeline (markdown-it/KaTeX/mermaid) reused. WYSIWYG (TipTap/Lexical/Milkdown) makes markdown lossy |
| Collab data model | **Yjs CRDT** — 1 note = `Y.Doc` (`content`→`Y.Text`, metadata→`Y.Map`, snippets→`Y.Array`) | character-level merge, local-first + real-time in one lib |
| Persistence | Yjs doc = source of truth; **`.cson` = derived snapshot** (write-back); `y-indexeddb` for local-first | keeps on-disk files + search + git interop |
| Sync backend | **self-hosted Hocuspocus** (fallback: y-sweet) | flat VPS cost, plaintext stays on our box, minimal lock-in |
| Auth | **device-pairing** (single-user, multiple devices) — NOT a multi-user auth provider | user confirmed: collaboration is across their own devices only. Yjs has no ACL, so the socket MUST still be gated (`onAuthenticate`) |
| Encryption | E2E NOT required (provider trust accepted); Yjs leaves an E2E escape hatch for later | user prioritized real-time over E2E |

Effort estimate (solo + AI): **~16–24 weeks**, phased, each phase shippable.
The CodeMirror 5→6 port is the only essential spike.

## What is already validated / done

- **`poc/collab-core/`** — runnable PoC proving the hardest part. `npm test`
  (Node 22) shows: device-pairing auth rejects bad tokens, A→B convergence,
  concurrent edits both survive, `.cson` snapshot write-back, late device
  re-seeded from snapshot. Browser client = HackMD-style split editor (CM6 +
  collaborative cursors + markdown-it/DOMPurify preview). **This is the editor
  pane prototype for the new app.**
- **`docs/MODERNIZATION-2026-stack-selection.md`** + **`-collab-revision.md`** —
  fact-checked design judgment (stars/license/versions/pricing verified;
  threat model; decision matrices; roadmap; locked decisions section).

## CI / Test infrastructure (legacy app)

### Pipelines
| Trigger | Workflow | Steps |
|---|---|---|
| push/PR to `main` | `ci.yml` | ESM/CJS check → lint → AVA → Jest → Vite build + size assert → **E2E (xvfb)** |
| push `v*` tag | `release-legacy.yml` | build → `--dir` pack → packaged-requires check → **packaged E2E (mac .app / win exe)** → publish（E2E FAIL なら公開されない） |
| manual `win-smoke.yml -f tag=vX.Y.Z` | win-smoke | install NSIS, DOM probe, assert main UI renders |

### E2E harness (real-renderer UI test)
- `npm run e2e`（要 `pnpm run compile` 済み）。`index.js` の `TB_E2E_PROBE` フック
  経由で `dev-scripts/e2e-probe.js` を main process にロード。
- 隔離 tmp userData/home（実 `~/Boostnote` を汚さない）で実アプリを起動し、
  新規ノート作成 → モーダル(ja/en両対応) → 空エディタ → CM setValue → 1s保存
  デバウンス → ノートリストのタイトル反映、まで実 UI を駆動して検証。
- レンダラー console を全採取 → サイレント失敗（`Cannot save note` 等）も出る。
- exit code: 0 pass / 1 flow fail / 2 probe error / 3 watchdog(90s)。
- packaged 検証: `pnpm run dist:dir` 後に
  `TB_E2E_PROBE="$PWD/dev-scripts/e2e-probe.js" "release/mac-arm64/The Boosters.app/Contents/MacOS/The Boosters"`

### Test layers
| Layer | Tool | What it covers |
|---|---|---|
| Data API | AVA (`tests/dataApi/`) | CSON file operations on real tmp storage |
| React components | Jest (`tests/components/`) | snapshot + props, identity-obj-proxy for .styl |
| Library units | Jest (`tests/lib/`) | pure utils, ESM API contracts, AI IPC |
| Static analysis | `check-esm-cjs-compat.mjs` | require() of ESM-default-only modules (Vite blind spot) |

### Key mocks (auto-applied via `__mocks__/`)
- `__mocks__/@electron/remote.js` — stubs all remote API so Jest never hits native bindings
- `__mocks__/electron.js` — stubs `electron` module
- `identity-obj-proxy` — returns class name strings for all `.styl` imports

### Known test blind spot
`babel-plugin-add-module-exports` makes `require(esm-default-module)` return the
default object in Jest/webpack-dev, masking any CJS/ESM mismatch. The Vite build
does NOT apply this patch — mismatches crash at runtime. **Always run
`node scripts/check-esm-cjs-compat.mjs` before releasing.**

### One-command pre-release gate
```bash
npm run pre-release
```
Runs: ESM/CJS → lint → AVA → Jest → Vite build → bundle size assert.

## Working rules

- **PRs go ONLY to `BoxPistols/Boostnote`** (never upstream BoostIO). Verify
  `isCrossRepository:false`. See the `pr-fork-only` memory.
- **Legacy app** runs on Node 14 via `~/.volta/bin/volta run --node 14.21.3 …`;
  do NOT `cd` into the repo in Bash (a chpwd hook spams `ls`). Tests: `npm test`
  (ava + jest); always `npm run lint` then `npm run fix` before commit. Diagnose
  renderer issues with `ELECTRON_ENABLE_LOGGING=1 npm run dev`.
- **Modern code** (`poc/`, future `app/`) uses Node 22:
  `~/.volta/bin/volta run --node 22.22.3 …`. Keep it isolated from the legacy
  build — `poc/` is in `.eslintignore`; new modern workspaces likewise.
- **Old/broken packages:** the legacy app loads several libs as global
  `<script>` tags / webpack externals in `lib/main.{development,production}.html`.
  Dependency bumps silently break those paths → infinite loading. Two have been
  fixed (flowchart.js → pin 1.10.0, #51; codemirror-mode-elixir → correct umd
  path, #56). Re-verify every `<script src="../node_modules/…">` resolves after
  any dep change. See the `flowchart-infinite-loading` memory.
- **Every modernization artifact (PoC / app / server) gets a README covering
  run + build + deploy/distribution + operations** (per the user's directive).
- Document new architecture decisions back into `docs/` and update this skill.

## New-app concept (benchmark Obsidian + HackMD)

Baseline = the current 3-pane UX (sidebar: All Notes / Starred / Trash + storages
/ folders / tags; note list with sort; split CM6 editor + live preview; dark
theme with the pink accent). Differentiators to explore: real-time collab across
your devices (HackMD), local-first files + extensibility/plugins + linking
(Obsidian). **The degree of departure from the familiar UX is a product decision
to confirm with the user before building the app shell.**

## Deploy / distribution / operations (target)

- **App distribution:** Electron auto-update (electron-updater) with signed +
  notarized mac (dmg/zip) and Windows (nsis) artifacts, built in CI.
- **Sync server:** Hocuspocus as a small Node service on a single VPS (or a
  container). TLS via a reverse proxy (Caddy/Traefik). Persist the Yjs update
  log (SQLite/Postgres) in addition to the `.cson` snapshot; nightly backups of
  both the DB and the snapshot dir. One always-on process; restart via systemd.
- **Cost shape:** flat ~$5–12/mo VPS, no per-user fees (single-user, few rooms).
- **Ops runbook lives in each component's README** and is kept current.

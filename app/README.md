# app — modern Boostnote shell (foundation)

The modernized app foundation: **Vite + React 19 + TypeScript + CodeMirror 6**,
reproducing the current Boostnote UI/UX (3-pane: sidebar / note list / split
editor + live preview, dark theme) on a fast, stable, extensible base.

Direction (confirmed with the user): **inherit the current UX but evolve it**,
and **prioritize a fast, stable foundation first** before new features. Inherits
**GPL-3.0**. Benchmarks: Obsidian (local-first, extensibility), HackMD (real-time
collab). This is **not** the legacy Electron app (the legacy lint/CI ignore `app/`).

## What's here (foundation slice)

- 3-pane shell matching the screenshot: `Sidebar` (All Notes / Starred / Trash +
  storages/folders + tags), `NoteList` (sorted by Updated), `MarkdownEditor`
  (CodeMirror 6, source markdown), `Preview` (markdown-it + DOMPurify).
- `types.ts` mirrors the **legacy `.cson` note shape**, so real notes load
  unchanged once the Electron `.cson` reader is wired.
- Sample data of that shape (`data/sampleNotes.ts`) so it runs standalone.
- Dark theme (`theme.css`) with the pink accent.

## Run

```bash
# Node 22 (the legacy app uses Node 14; this is a separate modern workspace)
npm install
npm run dev      # Vite dev server (browser; in-memory sample data)
npm run build    # tsc -b && vite build (type-checked production build)
npm test         # node --test: .cson data-layer tests

# Desktop app (Electron 42), reading your REAL .cson notes:
npm run build
BOOSTNOTE_STORAGE="/path/to/your/storage" npm run electron
#   BOOSTNOTE_STORAGE = path-separated list of legacy Boostnote storage roots
#   (each a folder with boostnote.json + notes/*.cson). Inside Electron the app
#   reads them via the preload bridge; in the browser it falls back to samples.
```

## Architecture (data layer)

- `electron/loadNotes.cjs` — pure Node reader: `boostnote.json` + `notes/*.cson`
  → the app's `Note` shape (unit-tested, no Electron needed).
- `electron/main.cjs` / `electron/preload.cjs` — secure shell (contextIsolation,
  sandbox, no nodeIntegration); one IPC channel `notes:load`.
- `src/data/repository.ts` — `createRepository()` picks the Electron reader when
  `window.boostnote` exists, else the in-memory sample repo.

## Packaging (download builds)

`electron-builder` packages the app into installers (config in `package.json`
`build`). `vite.config.ts` sets `base: './'` so `dist/` loads over `file://`.

```bash
npm run package:dir   # unpacked .app (fast, for local checks)
npm run package:mac   # macOS .dmg + .zip
npm run package:win   # Windows .exe (nsis)
```

Releases are automated: pushing an `app-v*` tag runs
`.github/workflows/release.yml`, which builds on macOS + Windows runners and
publishes installers to **GitHub Releases** (the user download links). Builds
are currently **unsigned** (no certificates configured) — add `APPLE_*` /
`WIN_CSC_*` secrets to ship signed + notarized artifacts.

## Roadmap (next slices)

1. **Data layer:** Electron `.cson` reader/writer over the real notes folder
   (replace sample data); virtualized note list for hundreds of notes.
2. **Search / tags / trash** parity with the legacy app.
3. **Editor depth:** KaTeX/mermaid/flowchart preview plugins, snippet notes,
   attachments.
4. **Collaboration:** swap the editor doc for a Yjs `Y.Text` + the validated
   `poc/collab-core` Hocuspocus sync (see that PoC).
5. **Packaging:** wrap in Electron (modern), auto-update, code-signing.

## Deploy / distribution / operations

- **Distribution:** package as an Electron app with `electron-updater`
  auto-update; **signed + notarized** macOS (dmg/zip) and Windows (nsis)
  artifacts built in CI. Versioned releases; staged rollout.
- **Build/CI:** `npm run build` is type-checked (`tsc -b`) and must stay green;
  add it to CI as a separate Node 22 job alongside the legacy jobs.
- **Runtime:** local-first — works fully offline against on-disk notes. When
  collaboration is enabled it talks to the self-hosted **Hocuspocus** sync server
  (its deploy/ops are in `poc/collab-core/README.md`: VPS + systemd + TLS,
  Yjs-log persistence + nightly backups, per-device pairing token in Electron
  `safeStorage`).
- **Config:** sync server URL + pairing are app settings; without them the app is
  a pure local note app.

---
name: beless-cloud-sync
description: The Boosters' backend-less storage & sync scheme — notes as one <key>.cson file per note in a filesystem folder the user places inside a cloud-sync directory (OneDrive/Dropbox/iCloud/Google Drive); the OS client does the syncing. Load this before touching storage/notes I/O, sync, attachments, boostnote.json, storage registration, or any doc/feature about multi-device data. Encodes the on-disk formats, the read-once-at-startup flow, the invariants (key/storage not in the file; ESM/CJS Vite gotcha; no live watcher; no conflict resolution; config is per-machine) and how to extend safely.
---

# Backend-less Cloud Sync — storage/sync architect skill

The Boosters (Boostnote Legacy fork, Electron 28 + React 16 + Redux + Vite) is
**backend-less and local-first**. There is **no server and no HTTP layer for
notes**. Each note is one plain file on disk; the user places the storage folder
inside their own cloud-sync directory and the **OS cloud client does the
syncing**. This is the current, implemented, documented architecture — not a
proposal. OneDrive has a step-by-step doc (`docs/ONEDRIVE-DESKTOP-SETUP.md`,
linked in-app from `StoragesTab.js`); Dropbox/iCloud/Google Drive work
identically but are not separately documented.

## On-disk data model (the contract)

```
<storagePath>/
  boostnote.json            # { folders: [{key,name,color}], version }  (CSON)
  notes/<key>.cson          # one note per file (CSON, via @rokt33r/season)
  attachments/<noteKey>/…   # binaries; referenced in content as :storage/<noteKey>/<file>
```

Storage record (persisted in `localStorage['storages']`, per-machine):
`{ key, type: 'FILESYSTEM', name, path, isOpen }`.

Note `.cson` fields: `createdAt, updatedAt, type, folder, title, tags[],
isStarred, isTrashed` + `content, linesHighlighted[]` (MARKDOWN_NOTE) **or**
`description, snippets[]{name,mode,content,linesHighlighted}` (SNIPPET_NOTE).

## Invariants — do NOT break these

1. **`key` and `storage` are NOT written into the `.cson` file.** They are
   reconstructed on read from the filename (`<key>.cson`) and the parent storage
   (`resolveStorageNotes.js`). Writes use `_.omit(noteData, ['key','storage'])`.
   Never persist them into the file.
2. **ESM/CJS × Vite trap.** `deleteNote.js`, `moveNote.js`, `deleteFolder.js`
   (any dataApi file containing an `import`) MUST use `export default`. A
   `module.exports =` in a file with an `import` is silently dropped by the Vite
   build → empty module at runtime, while jest/ava stay green. Do not "clean up"
   to CommonJS. (See [[vite-esm-cjs-mixed-exports]] in memory.)
3. **Notes are read once, at startup.** `dataApi.init()` runs a single time
   (`Main.js`) and reads every `.cson`. Afterwards the Redux store is updated
   only from the app's own write **return values** — there is no directory
   re-scan and **no live file watcher for notes** (the one `fs.watchFile` is for
   the dev bundle only). External changes appear only after an app restart.
4. **No in-app conflict resolution.** Concurrent two-device edits produce a
   cloud-client conflict copy (e.g. `name-PC.cson`); the user resolves manually.
   Do not add silent last-write-wins merging without an explicit decision.
5. **Sync carries the whole folder.** `notes/`, `attachments/`, and
   `boostnote.json` must move together; attachment links are relative
   placeholders (`:storage/<noteKey>/…`) so folder moves keep links intact.
6. **Config is per-machine, not synced.** `localStorage['config']` + `~/.boostnoterc`
   live outside the storage folder. Theme/hotkeys/AI keys are set per device.

## Key files

- `browser/lib/findStorage.js` — reads `localStorage['storages']`
- `browser/main/lib/dataApi/{addStorage,resolveStorageData,resolveStorageNotes,init,createNote,updateNote,deleteNote,attachmentManagement}.js`
- `browser/main/lib/ConfigManager.js`, `browser/lib/RcParser.js` — config + `.boostnoterc`
- `browser/main/Main.js` — startup `dataApi.init()` + welcome/cloud links
- `browser/main/modals/PreferencesModal/StoragesTab.js` — FILESYSTEM storage UI + cloud doc link
- `docs/ONEDRIVE-DESKTOP-SETUP.md`, `docs/MODERNIZATION-2026-stack-selection.md`

## When extending

- **Adding a note field?** Add it to `validateInput` in `createNote.js` AND the
  `updateNote.js` merge, keep it JSON-serializable, and remember it must survive
  a round-trip through CSON. It will sync automatically (it's in the file).
- **Want external-change awareness?** That means adding a real watcher
  (chokidar / `fs.watch` on `notes/`) that re-reads changed `.cson` and
  dispatches `UPDATE_NOTE`. This is a genuine feature, not a bugfix — beware
  echoing the app's own writes (debounce / ignore-self) and races with
  cloud-client partial writes. Get a decision before building it.
- **Want real conflict handling?** Out of scope for folder-sync; the roadmap
  parks realtime multi-device on Yjs CRDT + self-hosted Hocuspocus
  (`docs/MODERNIZATION-2026-stack-selection.md`, and [[modernization-direction]]).
- **New-device onboarding** is inherently manual (register the storage path,
  re-set config). Don't try to "sync settings" through the notes folder.

## Verifying storage/sync changes

Unit tests (jest/ava) cannot see the Vite ESM/CJS breakage or renderer wiring —
use a real-renderer probe (`dev-scripts/e2e-*-probe.js`, `TB_E2E_PROBE`) that
drives the actual app and asserts against the persisted `.cson` files on disk as
ground truth. See [[dev-verify-real-renderer-probe]] and
[[vite-esm-cjs-mixed-exports]].

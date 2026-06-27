'use strict'

// Reads legacy Boostnote `.cson` storages from disk into the app's Note shape.
// A "storage" is a folder containing `boostnote.json` (folder list) and a
// `notes/` subdir of `<key>.cson` files. This is the core of the Electron
// data layer; it is pure Node so it can be unit-tested without Electron.

const fs = require('node:fs')
const path = require('node:path')
const CSON = require('cson-parser')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function toNote(raw, key, storageKey) {
  return {
    key,
    type: raw.type === 'SNIPPET_NOTE' ? 'SNIPPET_NOTE' : 'MARKDOWN_NOTE',
    title: typeof raw.title === 'string' ? raw.title : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === 'string') : [],
    storage: storageKey,
    folder: typeof raw.folder === 'string' ? raw.folder : '',
    isStarred: !!raw.isStarred,
    isTrashed: !!raw.isTrashed,
    createdAt: String(raw.createdAt || ''),
    updatedAt: String(raw.updatedAt || raw.createdAt || '')
  }
}

/**
 * Load one storage directory.
 * @param {string} rootDir  storage folder (contains boostnote.json + notes/)
 * @param {string} [storageKey]
 * @returns {{ storage: object, notes: object[] }}
 */
function loadStorage(rootDir, storageKey) {
  const key = storageKey || path.basename(rootDir)
  const meta = readJson(path.join(rootDir, 'boostnote.json'))
  const storage = {
    key,
    name: meta.name || path.basename(rootDir),
    folders: (meta.folders || []).map(f => ({
      key: f.key,
      name: f.name,
      color: f.color
    }))
  }

  const notesDir = path.join(rootDir, 'notes')
  const notes = []
  if (fs.existsSync(notesDir)) {
    for (const file of fs.readdirSync(notesDir)) {
      if (!file.endsWith('.cson')) continue
      const raw = CSON.parse(fs.readFileSync(path.join(notesDir, file), 'utf8'))
      notes.push(toNote(raw, file.replace(/\.cson$/, ''), key))
    }
  }
  return { storage, notes }
}

// Fields the renderer may change; everything else in the raw `.cson` (e.g. a
// SNIPPET_NOTE's `snippets` array, or any unknown keys) is preserved untouched.
const EDITABLE = ['title', 'content', 'tags', 'isStarred', 'isTrashed', 'updatedAt']

/**
 * Write an edited note back to its `.cson` file, preserving every field the
 * renderer doesn't own. The file is located by `note.key` (its filename) under
 * one of the known storage roots; the write is atomic (temp file + rename).
 * @param {string[]} roots
 * @param {object} note  Note shape ({ key, title, content, tags, ... })
 * @returns {{ ok: boolean, file?: string, error?: string }}
 */
function saveNote(roots, note) {
  const key = String((note && note.key) || '')
  // Defense in depth: a key must be a bare filename, never a path.
  if (!key || /[/\\]/.test(key) || key.includes('..')) {
    return { ok: false, error: 'invalid note key' }
  }
  for (const root of roots) {
    if (!root) continue
    const notesDir = path.join(root, 'notes')
    const file = path.join(notesDir, `${key}.cson`)
    if (path.dirname(file) !== notesDir) continue // reject traversal
    if (!fs.existsSync(file)) continue

    const raw = CSON.parse(fs.readFileSync(file, 'utf8'))
    const merged = { ...raw }
    for (const f of EDITABLE) {
      if (note[f] !== undefined) merged[f] = note[f]
    }
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, CSON.stringify(merged, null, 2))
    fs.renameSync(tmp, file) // atomic replace
    return { ok: true, file }
  }
  return { ok: false, error: `note "${key}" not found in any storage` }
}

/**
 * Load several storage roots and aggregate them.
 * @param {string[]} roots
 * @returns {{ storages: object[], notes: object[] }}
 */
function loadStorages(roots) {
  const storages = []
  const notes = []
  for (const root of roots) {
    if (!root || !fs.existsSync(path.join(root, 'boostnote.json'))) continue
    const { storage, notes: ns } = loadStorage(root)
    storages.push(storage)
    notes.push(...ns)
  }
  return { storages, notes }
}

module.exports = { loadStorage, loadStorages, toNote, saveNote }

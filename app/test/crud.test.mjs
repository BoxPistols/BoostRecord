import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createNote, deleteNote, loadStorage } = require('../electron/loadNotes.cjs')

function makeStorage(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-crud-'))
  fs.writeFileSync(
    path.join(root, 'boostnote.json'),
    JSON.stringify({ name: name || 'S', folders: [{ key: 'f1', name: 'Inbox' }] })
  )
  fs.mkdirSync(path.join(root, 'notes'))
  return root
}

test('createNote writes a loadable empty note in the storage', () => {
  const root = makeStorage()
  const res = createNote([root], { storage: path.basename(root), folder: 'f1' })
  assert.equal(res.ok, true)
  assert.ok(res.note.key)
  assert.equal(res.note.isTrashed, false)
  assert.equal(res.note.folder, 'f1')
  assert.equal(res.note.type, 'MARKDOWN_NOTE')

  // it is a real file the loader can read back
  const { notes } = loadStorage(root)
  assert.equal(notes.length, 1)
  assert.equal(notes[0].key, res.note.key)

  fs.rmSync(root, { recursive: true, force: true })
})

test('createNote falls back to the first root when storage is unknown', () => {
  const root = makeStorage()
  const res = createNote([root], { storage: 'does-not-exist' })
  assert.equal(res.ok, true)
  assert.equal(fs.readdirSync(path.join(root, 'notes')).length, 1)
  fs.rmSync(root, { recursive: true, force: true })
})

test('createNote returns ok:false when there is no storage', () => {
  const res = createNote([], {})
  assert.equal(res.ok, false)
})

test('deleteNote removes the file; deleting again reports not found', () => {
  const root = makeStorage()
  const { note } = createNote([root], { storage: path.basename(root) })
  const first = deleteNote([root], note.key)
  assert.equal(first.ok, true)
  assert.equal(fs.existsSync(path.join(root, 'notes', `${note.key}.cson`)), false)

  const second = deleteNote([root], note.key)
  assert.equal(second.ok, false)
  assert.match(second.error, /not found/)
  fs.rmSync(root, { recursive: true, force: true })
})

test('deleteNote rejects keys with path separators or traversal', () => {
  const root = makeStorage()
  for (const bad of ['../x', 'a/b', '..\\y', '']) {
    assert.equal(deleteNote([root], bad).ok, false)
  }
  fs.rmSync(root, { recursive: true, force: true })
})

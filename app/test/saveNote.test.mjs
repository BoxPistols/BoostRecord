import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const CSON = require('cson-parser')
const { saveNote, loadStorage } = require('../electron/loadNotes.cjs')

function makeStorage(rawNote) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-save-'))
  fs.writeFileSync(
    path.join(root, 'boostnote.json'),
    JSON.stringify({ name: 'S', folders: [{ key: 'f1', name: 'Inbox' }] })
  )
  fs.mkdirSync(path.join(root, 'notes'))
  fs.writeFileSync(path.join(root, 'notes', 'n1.cson'), CSON.stringify(rawNote, null, 2))
  return root
}

test('saveNote updates editable fields and preserves the rest', () => {
  const root = makeStorage({
    type: 'MARKDOWN_NOTE',
    folder: 'f1',
    title: 'Old',
    content: 'old body',
    tags: ['a'],
    isStarred: false,
    isTrashed: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    linesHighlighted: [1, 2] // unknown field the renderer doesn't own
  })

  const res = saveNote([root], {
    key: 'n1',
    title: 'New',
    content: 'new body',
    tags: ['a', 'b'],
    isStarred: true,
    isTrashed: false,
    updatedAt: '2026-06-28T00:00:00.000Z'
  })
  assert.equal(res.ok, true)

  const raw = CSON.parse(fs.readFileSync(path.join(root, 'notes', 'n1.cson'), 'utf8'))
  assert.equal(raw.title, 'New')
  assert.equal(raw.content, 'new body')
  assert.deepEqual(raw.tags, ['a', 'b'])
  assert.equal(raw.isStarred, true)
  assert.equal(raw.updatedAt, '2026-06-28T00:00:00.000Z')
  // preserved, untouched
  assert.equal(raw.createdAt, '2025-01-01T00:00:00.000Z')
  assert.deepEqual(raw.linesHighlighted, [1, 2])
  assert.equal(raw.folder, 'f1')

  // and it round-trips back through the loader
  const { notes } = loadStorage(root)
  assert.equal(notes[0].content, 'new body')
  assert.equal(notes[0].isStarred, true)

  fs.rmSync(root, { recursive: true, force: true })
})

test('saveNote leaves no temp file behind (atomic)', () => {
  const root = makeStorage({ type: 'MARKDOWN_NOTE', content: 'x', createdAt: '2025-01-01' })
  saveNote([root], { key: 'n1', content: 'y' })
  const files = fs.readdirSync(path.join(root, 'notes'))
  assert.deepEqual(files, ['n1.cson'])
  fs.rmSync(root, { recursive: true, force: true })
})

test('saveNote rejects keys with path separators or traversal', () => {
  const root = makeStorage({ type: 'MARKDOWN_NOTE', content: 'x' })
  for (const bad of ['../secret', 'a/b', '..\\x', '']) {
    const res = saveNote([root], { key: bad, content: 'z' })
    assert.equal(res.ok, false)
  }
  fs.rmSync(root, { recursive: true, force: true })
})

test('saveNote returns ok:false when the note is in no storage', () => {
  const root = makeStorage({ type: 'MARKDOWN_NOTE', content: 'x' })
  const res = saveNote([root], { key: 'missing', content: 'z' })
  assert.equal(res.ok, false)
  assert.match(res.error, /not found/)
  fs.rmSync(root, { recursive: true, force: true })
})

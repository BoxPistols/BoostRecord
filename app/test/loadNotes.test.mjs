import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadStorage, loadStorages } = require('../electron/loadNotes.cjs')

function makeStorage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-storage-'))
  fs.writeFileSync(
    path.join(root, 'boostnote.json'),
    JSON.stringify({
      name: 'client',
      folders: [
        { key: 'aim', name: 'AIM', color: '#e6b800' },
        { key: 'kdd', name: 'KDD', color: '#4ade80' }
      ]
    })
  )
  const notesDir = path.join(root, 'notes')
  fs.mkdirSync(notesDir)
  fs.writeFileSync(
    path.join(notesDir, 'abc123.cson'),
    `createdAt: '2025-12-03T10:00:00.000Z'
updatedAt: '2025-12-03T10:00:00.000Z'
type: 'MARKDOWN_NOTE'
folder: 'aim'
title: 'CLS 改善計画'
tags: ['perf', 'seo']
isStarred: true
isTrashed: false
content: '''
# CLS 改善計画

- a
- b
'''`
  )
  fs.writeFileSync(
    path.join(notesDir, 'def456.cson'),
    `type: 'SNIPPET_NOTE'
folder: 'kdd'
title: 'snippet'
tags: []
content: 'x'`
  )
  // A non-.cson file must be ignored.
  fs.writeFileSync(path.join(notesDir, 'README.txt'), 'ignore me')
  return root
}

test('loadStorage parses boostnote.json + notes/*.cson', () => {
  const root = makeStorage()
  const { storage, notes } = loadStorage(root, 'client')

  assert.equal(storage.key, 'client')
  assert.equal(storage.name, 'client')
  assert.equal(storage.folders.length, 2)
  assert.equal(storage.folders[0].name, 'AIM')

  assert.equal(notes.length, 2) // README.txt ignored
  const cls = notes.find(n => n.key === 'abc123')
  assert.equal(cls.title, 'CLS 改善計画')
  assert.equal(cls.type, 'MARKDOWN_NOTE')
  assert.equal(cls.folder, 'aim')
  assert.equal(cls.storage, 'client')
  assert.equal(cls.isStarred, true)
  assert.deepEqual(cls.tags, ['perf', 'seo'])
  assert.ok(cls.content.startsWith('# CLS 改善計画'))

  const snip = notes.find(n => n.key === 'def456')
  assert.equal(snip.type, 'SNIPPET_NOTE')
  assert.equal(snip.isStarred, false) // defaulted
  assert.deepEqual(snip.tags, [])

  fs.rmSync(root, { recursive: true, force: true })
})

test('loadStorages aggregates and skips non-storage roots', () => {
  const a = makeStorage()
  const b = makeStorage()
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-empty-'))
  const { storages, notes } = loadStorages([a, b, empty, '/does/not/exist'])
  assert.equal(storages.length, 2)
  assert.equal(notes.length, 4)
  fs.rmSync(a, { recursive: true, force: true })
  fs.rmSync(b, { recursive: true, force: true })
  fs.rmSync(empty, { recursive: true, force: true })
})

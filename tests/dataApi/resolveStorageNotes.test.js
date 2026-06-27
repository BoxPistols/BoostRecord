const os = require('os')
const fs = require('fs')
const path = require('path')
const sander = require('sander')
const CSON = require('@rokt33r/season')
const resolveStorageNotes = require('browser/main/lib/dataApi/resolveStorageNotes')

const storagePath = path.join(os.tmpdir(), 'boostnote-test-resolveStorageNotes')

afterEach(() => {
  sander.rimrafSync(storagePath)
})

it('returns an empty list and creates the notes dir when it is missing', () => {
  return resolveStorageNotes({ key: 's1', path: storagePath }).then(notes => {
    expect(notes).toEqual([])
    expect(fs.existsSync(path.join(storagePath, 'notes'))).toBe(true)
  })
})

it('parses .cson notes and attaches the key and storage', () => {
  const notesDir = path.join(storagePath, 'notes')
  sander.mkdirSync(notesDir)
  CSON.writeFileSync(path.join(notesDir, 'abc.cson'), { title: 'Hello' })
  fs.writeFileSync(path.join(notesDir, 'ignore.txt'), 'not a note')

  return resolveStorageNotes({ key: 's1', path: storagePath }).then(notes => {
    expect(notes.length).toBe(1)
    expect(notes[0].title).toBe('Hello')
    expect(notes[0].key).toBe('abc')
    expect(notes[0].storage).toBe('s1')
  })
})

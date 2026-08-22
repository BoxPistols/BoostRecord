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

// 過去の updateNote のフィルタ不具合で snippets: [] の SNIPPET_NOTE が
// ディスク上に実在する。ロードが唯一の入口なので、ここで修復しないと
// そのノートを開いた瞬間にアプリが白画面で落ちる
it('heals a SNIPPET_NOTE whose snippets array is empty or missing', () => {
  const notesDir = path.join(storagePath, 'notes')
  sander.mkdirSync(notesDir)
  CSON.writeFileSync(path.join(notesDir, 'empty.cson'), {
    type: 'SNIPPET_NOTE',
    title: 'broken-empty',
    snippets: []
  })
  CSON.writeFileSync(path.join(notesDir, 'missing.cson'), {
    type: 'SNIPPET_NOTE',
    title: 'broken-missing'
  })

  return resolveStorageNotes({ key: 's1', path: storagePath }).then(notes => {
    expect(notes.length).toBe(2)
    notes.forEach(note => {
      expect(note.snippets).toEqual([
        { name: '', mode: null, content: '', linesHighlighted: [] }
      ])
    })
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

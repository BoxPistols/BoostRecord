const sander = require('sander')
const path = require('path')
const CSON = require('@rokt33r/season')

function resolveStorageNotes(storage) {
  const notesDirPath = path.join(storage.path, 'notes')
  let notePathList
  try {
    notePathList = sander.readdirSync(notesDirPath)
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(notesDirPath, " doesn't exist.")
      sander.mkdirSync(notesDirPath)
    } else {
      console.warn('Failed to find note dir', notesDirPath, err)
    }
    notePathList = []
  }
  const notes = notePathList
    .filter(function filterOnlyCSONFile(notePath) {
      return /\.cson$/.test(notePath)
    })
    .map(function parseCSONFile(notePath) {
      try {
        const data = CSON.readFileSync(path.join(notesDirPath, notePath))
        // SNIPPET_NOTE は snippets が最低1個ある前提で描画される。過去の
        // updateNote のフィルタ退行(v0.16.10〜v0.18.0)が snippets: [] を
        // 書き込んだファイルが実在するため、全ノートが通るここで修復する。
        // 次回保存時にディスク側も直る
        if (
          data.type === 'SNIPPET_NOTE' &&
          (!Array.isArray(data.snippets) || data.snippets.length === 0)
        ) {
          data.snippets = [
            { name: '', mode: null, content: '', linesHighlighted: [] }
          ]
        }
        data.key = path.basename(notePath, '.cson')
        data.storage = storage.key
        return data
      } catch (err) {
        console.error(`error on note path: ${notePath}, error: ${err}`)
      }
    })
    .filter(function filterOnlyNoteObject(noteObj) {
      return typeof noteObj === 'object'
    })

  return Promise.resolve(notes)
}

module.exports = resolveStorageNotes

// deleteNote is ESM-default-only, so it must be imported (a require() would
// yield the module namespace object in the Vite build — see check-esm-cjs).
import deleteSingleNote from './deleteNote'
const _ = require('lodash')
const path = require('path')
const resolveStorageData = require('./resolveStorageData')
const resolveStorageNotes = require('./resolveStorageNotes')
const CSON = require('@rokt33r/season')
const { findStorage } = require('browser/lib/findStorage')

/**
 * @param {String} storageKey
 * @param {String} folderKey
 *
 * @return {Object}
 * ```
 * {
 *   storage: Object,
 *   folderKey: String
 * }
 * ```
 */
function deleteFolder(storageKey, folderKey) {
  let targetStorage
  try {
    // folderKey の検証が無いと致命的になる。この関数は
    // `note.folder === folderKey` でノートを選び、deleteNote は
    // ゴミ箱を経由せず sander.unlinkSync で**物理削除**する。
    // folderKey が undefined のまま来ると、`folder` フィールドを持たない
    // .cson が軒並み一致して消える（storage.folders 側のフィルタは
    // 何も除外しないので、フォルダ一覧は無傷のまま中身だけ失われる）
    if (!_.isString(folderKey) || folderKey.trim() === '') {
      throw new Error('Invalid folder key')
    }
    targetStorage = findStorage(storageKey)
  } catch (e) {
    return Promise.reject(e)
  }

  return resolveStorageData(targetStorage)
    .then(function assignNotes(storage) {
      return resolveStorageNotes(storage).then(notes => {
        return {
          storage,
          notes
        }
      })
    })
    .then(function deleteFolderAndNotes(data) {
      const { storage, notes } = data
      // レコードの実在を確かめてから消す。存在しない key で呼ばれた場合、
      // フォルダ一覧は 1 件も減らないのにノートだけ消えるという最悪の形に
      // なるので、ここで止める
      if (!_.find(storage.folders, { key: folderKey })) {
        throw new Error('Folder not found: ' + folderKey)
      }
      storage.folders = storage.folders.filter(function excludeTargetFolder(
        folder
      ) {
        return folder.key !== folderKey
      })

      const targetNotes = notes.filter(function filterTargetNotes(note) {
        return note.folder === folderKey
      })

      const deleteAllNotes = targetNotes.map(function deleteNote(note) {
        return deleteSingleNote(storageKey, note.key)
      })
      return Promise.all(deleteAllNotes).then(() => storage)
    })
    .then(function(storage) {
      // boostnote.json が読めなかったストレージへは書き戻さない。
      // 空の folders を永続化すると全フォルダレコードが失われる
      if (storage.foldersUnreadable) {
        throw new Error(
          'boostnote.json could not be read; refusing to overwrite it'
        )
      }
      CSON.writeFileSync(
        path.join(storage.path, 'boostnote.json'),
        _.pick(storage, ['folders', 'version'])
      )

      return {
        storage,
        folderKey
      }
    })
}

// ESM export required — with the import above, `module.exports =` would be
// silently dropped by the Vite build.
export default deleteFolder

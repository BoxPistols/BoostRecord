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

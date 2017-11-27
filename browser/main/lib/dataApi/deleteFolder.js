const _ = require('lodash')
const path = require('path')
const resolveStorageData = require('./resolveStorageData')
const resolveStorageNotes = require('./resolveStorageNotes')
const CSON = require('@rokt33r/season')
const sander = require('sander')
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
function deleteFolder (storageKey, folderKey) {
  let targetStorage
  try {
    targetStorage = findStorage(storageKey)
  } catch (e) {
    return Promise.reject(e)
  }

  return resolveStorageData(targetStorage)
    .then(function assignNotes (storage) {
      return resolveStorageNotes(storage)
        .then((notes) => {
          return {
            storage,
            notes
          }
        })
    })
    .then(function deleteFolderAndNotes (data) {
      const { storage, notes } = data
      storage.folders = storage.folders
        .filter(function excludeTargetFolder (folder) {
          return folder.key !== folderKey
        })

      const targetNotes = notes.filter(function filterTargetNotes (note) {
        return note.folder === folderKey
      })

      const deleteAllNotes = targetNotes
        .map(function deleteNote (note) {
          const notePath = path.join(storage.path, 'notes', note.key + '.cson')
          return sander.unlink(notePath)
            .catch(function (err) {
              console.warn('Failed to delete', notePath, err)
            })
        })
      return Promise.all(deleteAllNotes)
        .then(() => storage)
    })
    .then(function (storage) {
      CSON.writeFileSync(path.join(storage.path, 'boostnote.json'), _.pick(storage, ['folders', 'version']))

      return {
        storage,
        folderKey
      }
    })
}

module.exports = deleteFolder

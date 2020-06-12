import { findStorage } from 'browser/lib/findStorage'
import resolveStorageData from './resolveStorageData'
import resolveStorageNotes from './resolveStorageNotes'
import getFilename from './getFilename'
import exportNote from './exportNote'
import getContentFormatter from './getContentFormatter'

/**
 * @param {String} storageKey
 * @param {String} folderKey
 * @param {String} fileType
 * @param {String} exportDir
 * @param {Object} config
 *
 * @return {Object}
 * ```
 * {
 *   storage: Object,
 *   folderKey: String,
 *   fileType: String,
 *   exportDir: String
 * }
 * ```
 */

function exportFolder(storageKey, folderKey, fileType, exportDir, config) {
  let targetStorage
  try {
    targetStorage = findStorage(storageKey)
  } catch (e) {
    return Promise.reject(e)
  }

  const deduplicator = {}

  return resolveStorageData(targetStorage)
    .then(storage => {
      return resolveStorageNotes(storage).then(notes => ({
        storage,
        notes: notes.filter(
          note =>
            note.folder === folderKey &&
            !note.isTrashed &&
            note.type === 'MARKDOWN_NOTE'
        )
      }))
    })
    .then(({ storage, notes }) => {
      const contentFormatter = getContentFormatter(storage, fileType, config)

      return Promise.all(
        notes.map(note => {
          const targetPath = getFilename(
            note,
            fileType,
            exportDir,
            deduplicator
          )

          return exportNote(storage.key, note, targetPath, contentFormatter)
        })
      ).then(() => ({
        storage,
        folderKey,
        fileType,
        exportDir
      }))
    })
}

module.exports = exportFolder

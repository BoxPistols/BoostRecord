import { findStorage } from 'browser/lib/findStorage'
import resolveStorageData from './resolveStorageData'
import resolveStorageNotes from './resolveStorageNotes'
import filenamify from 'filenamify'
import path from 'path'
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
          const targetPath = path.join(
            exportDir,
            `${filenamify(note.title, { replacement: '_' })}.${fileType}`
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

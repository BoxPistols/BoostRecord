import { findStorage } from 'browser/lib/findStorage'
import resolveStorageData from './resolveStorageData'
import resolveStorageNotes from './resolveStorageNotes'
import filenamify from 'filenamify'
import path from 'path'
import fs from 'fs'
import exportNote from './exportNote'
import getContentFormatter from './getContentFormatter'
import getFilename from './getFilename'

/**
 * @param {String} storageKey
 * @param {String} fileType
 * @param {String} exportDir
 * @param {Object} config
 *
 * @return {Object}
 * ```
 * {
 *   storage: Object,
 *   fileType: String,
 *   exportDir: String
 * }
 * ```
 */

function exportStorage(storageKey, fileType, exportDir, config) {
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
          note => !note.isTrashed && note.type === 'MARKDOWN_NOTE'
        )
      }))
    })
    .then(({ storage, notes }) => {
      const contentFormatter = getContentFormatter(storage, fileType, config)

      const folderNamesMapping = {}
      const deduplicators = {}

      storage.folders.forEach(folder => {
        const folderExportedDir = path.join(
          exportDir,
          filenamify(folder.name, { replacement: '_' })
        )

        folderNamesMapping[folder.key] = folderExportedDir

        // make sure directory exists
        try {
          fs.mkdirSync(folderExportedDir)
        } catch (e) {}

        deduplicators[folder.key] = {}
      })

      return Promise.all(
        notes.map(note => {
          const targetPath = getFilename(
            note,
            fileType,
            folderNamesMapping[note.folder],
            deduplicators[note.folder]
          )

          return exportNote(storage.key, note, targetPath, contentFormatter)
        })
      ).then(() => ({
        storage,
        fileType,
        exportDir
      }))
    })
}

module.exports = exportStorage

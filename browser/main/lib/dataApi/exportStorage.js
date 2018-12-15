import { findStorage } from 'browser/lib/findStorage'
import resolveStorageData from './resolveStorageData'
import resolveStorageNotes from './resolveStorageNotes'
import filenamify from 'filenamify'
import path from 'path'
import fs from 'fs'
import exportNote from './exportNote'
import formatMarkdown from './formatMarkdown'
import formatHTML from './formatHTML'

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

function exportStorage (storageKey, fileType, exportDir, config) {
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
        notes: notes.filter(note => !note.isTrashed && note.type === 'MARKDOWN_NOTE')
      }))
    })
    .then(({ storage, notes }) => {
      let contentFormatter = null
      if (fileType === 'md') {
        contentFormatter = formatMarkdown({
          storagePath: storage.path,
          export: config.export
        })
      } else if (fileType === 'html') {
        contentFormatter = formatHTML({
          theme: config.ui.theme,
          fontSize: config.preview.fontSize,
          fontFamily: config.preview.fontFamily,
          codeBlockTheme: config.preview.codeBlockTheme,
          codeBlockFontFamily: config.editor.fontFamily,
          lineNumber: config.preview.lineNumber,
          indentSize: config.editor.indentSize,
          scrollPastEnd: config.preview.scrollPastEnd,
          smartQuotes: config.preview.smartQuotes,
          breaks: config.preview.breaks,
          sanitize: config.preview.sanitize,
          customCSS: config.preview.customCSS,
          allowCustomCSS: config.preview.allowCustomCSS,
          storagePath: storage.path,
          export: config.export
        })
      }

      const folderNamesMapping = {}
      storage.folders.forEach(folder => {
        const folderExportedDir = path.join(exportDir, filenamify(folder.name, {replacement: '_'}))

        folderNamesMapping[folder.key] = folderExportedDir

        // make sure directory exists
        try {
          fs.mkdirSync(folderExportedDir)
        } catch (e) {}
      })

      return Promise
        .all(notes.map(note => {
          const targetPath = path.join(folderNamesMapping[note.folder], `${filenamify(note.title, {replacement: '_'})}.${fileType}`)

          return exportNote(storage.key, note, targetPath, contentFormatter)
        }))
        .then(() => ({
          storage,
          fileType,
          exportDir
        }))
    })
}

module.exports = exportStorage

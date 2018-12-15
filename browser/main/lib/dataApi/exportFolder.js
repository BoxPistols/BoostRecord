import { findStorage } from 'browser/lib/findStorage'
import resolveStorageData from './resolveStorageData'
import resolveStorageNotes from './resolveStorageNotes'
import filenamify from 'filenamify'
import path from 'path'
import exportNote from './exportNote'
import formatMarkdown from './formatMarkdown'
import formatHTML from './formatHTML'

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

function exportFolder (storageKey, folderKey, fileType, exportDir, config) {
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
        notes: notes.filter(note => note.folder === folderKey && !note.isTrashed && note.type === 'MARKDOWN_NOTE')
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

      return Promise
        .all(notes.map(note => {
          const targetPath = path.join(exportDir, `${filenamify(note.title, {replacement: '_'})}.${fileType}`)

          return exportNote(storage.key, note, targetPath, contentFormatter)
        }))
        .then(() => ({
          storage,
          folderKey,
          fileType,
          exportDir
        }))
    })
}

module.exports = exportFolder

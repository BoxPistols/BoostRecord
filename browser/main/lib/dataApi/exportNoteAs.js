import { findStorage } from 'browser/lib/findStorage'
import exportNote from './exportNote'
import formatMarkdown from './formatMarkdown'
import formatHTML from './formatHTML'

/**
 * @param {Object} note
 * @param {String} filename
 * @param {String} fileType
 * @param {Object} config
 */

function exportNoteAs (note, filename, fileType, config) {
  const storage = findStorage(note.storage)

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

  return exportNote(storage.key, note, filename, contentFormatter)
}

module.exports = exportNoteAs

import { findStorage } from 'browser/lib/findStorage'
import exportNote from './exportNote'
import getContentFormatter from './getContentFormatter'

/**
 * @param {Object} note
 * @param {String} filename
 * @param {String} fileType
 * @param {Object} config
 */

function exportNoteAs(note, filename, fileType, config) {
  const storage = findStorage(note.storage)
  const contentFormatter = getContentFormatter(storage, fileType, config)

  return exportNote(storage.key, note, filename, contentFormatter)
}

module.exports = exportNoteAs

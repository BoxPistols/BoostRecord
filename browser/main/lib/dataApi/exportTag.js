import exportNoteAs from './exportNoteAs'
import getFilename from './getFilename'

/**
 * @param {Object} data
 * @param {String} tag
 * @param {String} fileType
 * @param {String} exportDir
 * @param {Object} config
 */

function exportTag(data, tag, fileType, exportDir, config) {
  const notes = data.noteMap
    .map(note => note)
    .filter(note => note.tags.indexOf(tag) !== -1)

  const deduplicator = {}

  return Promise.all(
    notes.map(note => {
      const filename = getFilename(note, fileType, exportDir, deduplicator)

      return exportNoteAs(note, filename, fileType, config)
    })
  )
}

module.exports = exportTag

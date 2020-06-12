import exportNoteAs from './exportNoteAs'
import filenamify from 'filenamify'
import path from 'path'

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

  return Promise.all(
    notes.map(note => {
      const filename = path.join(
        exportDir,
        `${filenamify(note.title, { replacement: '_' })}.${fileType}`
      )

      return exportNoteAs(note, filename, fileType, config)
    })
  )
}

module.exports = exportTag

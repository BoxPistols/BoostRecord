import filenamify from 'filenamify'
import i18n from 'browser/lib/i18n'
import path from 'path'

/**
 * @param {Object} note
 * @param {String} fileType
 * @param {String} directory
 * @param {Object} deduplicator
 *
 * @return {String}
 */

function getFilename(note, fileType, directory, deduplicator) {
  const basename = note.title
    ? filenamify(note.title, { replacement: '_' })
    : i18n.__('Untitled')

  if (deduplicator) {
    if (deduplicator[basename]) {
      const filename = path.join(
        directory,
        `${basename} (${deduplicator[basename]}).${fileType}`
      )

      ++deduplicator[basename]

      return filename
    } else {
      deduplicator[basename] = 1
    }
  }

  return path.join(directory, `${basename}.${fileType}`)
}

module.exports = getFilename

import exportImage from 'browser/main/lib/dataApi/exportImage'
import {findStorage} from 'browser/lib/findStorage'

const fs = require('fs')
const path = require('path')

/**
 * Export note together with images
 *
 * If images is stored in the storage, creates 'images' subfolder in target directory
 * and copies images to it. Changes links to images in the content of the note
 *
 * @param {String} storageKey
 * @param {String} noteContent Content to export
 * @param {String} targetPath Path to exported file
 * @return {Promise.<*[]>}
 */
function exportNote (storageKey, noteContent, targetPath) {
  const targetStorage = findStorage(storageKey)
  const storagedImagesRe = /!\[(.*?)\]\(\s*?\/:storage\/(.*\.\S*?)\)/gi
  const exportTasks = []
  const images = []

  const exportedData = noteContent.replace(storagedImagesRe, (match, dstFilename, srcFilename) => {
    if (!path.extname(dstFilename)) {
      dstFilename += path.extname(srcFilename)
    }
    const imagePath = path.join('images', dstFilename)

    exportTasks.push(
        exportImage(targetStorage.path, srcFilename, path.dirname(targetPath), dstFilename)
    )
    images.push(imagePath)
    return `![${dstFilename}](${imagePath})`
  })

  exportTasks.push(exportFile(exportedData, targetPath))
  return Promise.all(exportTasks)
      .catch((err) => {
        rollbackExport(images)
        throw err
      })
}

function exportFile (data, filename) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filename, data, (err) => {
      if (err) throw err

      resolve(filename)
    })
  })
}

/**
 * Remove exported images
 * @param imagesPaths
 */
function rollbackExport (imagesPaths) {
  imagesPaths.forEach((path) => {
    if (fs.existsSync(path)) {
      fs.unlink(path)
    }
  })
}

export default exportNote

const fs = require('fs')
const path = require('path')
const { findStorage } = require('browser/lib/findStorage')

/**
 * @description To copy an image and return the path.
 * @param {String} filePath
 * @param {String} storageKey
 * @return {String} an image path
 */
function copyImage (filePath, storageKey) {
  return new Promise((resolve, reject) => {
    try {
      const targetStorage = findStorage(storageKey)

      const inputImage = fs.createReadStream(filePath)
      const imageExt = path.extname(filePath)
      const imageName = Math.random().toString(36).slice(-16)
      const basename = `${imageName}${imageExt}`
      const imageDir = path.join(targetStorage.path, 'images')
      if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir)
      const outputImage = fs.createWriteStream(path.join(imageDir, basename))
      inputImage.pipe(outputImage)
      resolve(basename)
    } catch (e) {
      return reject(e)
    }
  })
}

module.exports = copyImage

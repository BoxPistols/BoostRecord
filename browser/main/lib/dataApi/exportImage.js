const fs = require('fs')
const path = require('path')

/**
 * @description Export an image
 * @param {String} storagePath
 * @param {String} srcFilename
 * @param {String} dstPath
 * @param {String} dstFilename if not present, destination filename will be equal to srcFilename
 * @return {Promise} an image path
 */
function exportImage (storagePath, srcFilename, dstPath, dstFilename = '') {
  dstFilename = dstFilename || srcFilename

  const src = path.join(storagePath, 'images', srcFilename)

  if (!path.extname(dstFilename)) {
    dstFilename += path.extname(srcFilename)
  }

  const dstImagesFolder = path.join(dstPath, 'images')
  const dst = path.join(dstImagesFolder, dstFilename)

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dstImagesFolder)) fs.mkdirSync(dstImagesFolder)

    const input = fs.createReadStream(src)
    const output = fs.createWriteStream(dst)

    output.on('error', reject)
    input.on('error', reject)
    input.on('end', resolve)
    input.pipe(output)
  })
}

module.exports = exportImage

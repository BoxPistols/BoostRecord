const fs = require('fs')
const path = require('path')

/**
 * @description Export a file
 * @param {String} storagePath
 * @param {String} srcFilename
 * @param {String} dstPath
 * @param {String} dstFilename if not present, destination filename will be equal to srcFilename
 * @return {Promise} an image path
 */
function exportFile (storagePath, srcFilename, dstPath, dstFilename = '') {
  dstFilename = dstFilename || srcFilename

  const src = path.join(storagePath, 'images', srcFilename)

  if (!path.extname(dstFilename)) {
    dstFilename += path.extname(srcFilename)
  }

  const dst = path.join(dstPath, dstFilename)

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dstPath)) fs.mkdirSync(dstPath)

    const input = fs.createReadStream(src)
    const output = fs.createWriteStream(dst)

    output.on('error', reject)
    input.on('error', reject)
    input.on('end', resolve, dst)
    input.pipe(output)
  })
}

module.exports = exportFile

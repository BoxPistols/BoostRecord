// Test-only CJS shim for the ESM-only file-url@4 (see escape-string-regexp
// shim for why). Mirrors the real behaviour for absolute paths.
const path = require('path')

module.exports = function fileUrl(filePath, options) {
  if (typeof filePath !== 'string') {
    throw new TypeError('Expected a string')
  }
  const resolve = !options || options.resolve !== false
  let pathName = resolve ? path.resolve(filePath) : filePath
  pathName = pathName.replace(/\\/g, '/')
  // Windows drive letter must be prefixed with a slash.
  if (pathName[0] !== '/') pathName = `/${pathName}`
  return encodeURI(`file://${pathName}`).replace(/[?#]/g, encodeURIComponent)
}

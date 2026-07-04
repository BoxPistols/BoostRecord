// Test-only CJS shim: escape-string-regexp@5 is ESM-only, which jest 22 /
// ava+babel-register cannot execute. Mirrors the real implementation.
module.exports = function escapeStringRegexp(string) {
  if (typeof string !== 'string') {
    throw new TypeError('Expected a string')
  }
  return string.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d')
}

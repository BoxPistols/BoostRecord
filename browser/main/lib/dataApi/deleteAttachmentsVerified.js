const fs = require('fs')
const path = require('path')

function stillExists(p) {
  try {
    fs.statSync(p)
    return true
  } catch (e) {
    return false
  }
}

/**
 * Physically delete attachment files and VERIFY each is actually gone from disk
 * (the app's note-delete path only warns on unlink failure, which can silently
 * leave files behind on locked/OneDrive paths). Also removes a note's
 * attachment folder once it becomes empty.
 *
 * @param {string[]} absPaths absolute file paths to delete
 * @returns {Promise<{deleted: string[], failed: Array<{path:string, reason:string}>}>}
 */
function deleteAttachmentsVerified(absPaths) {
  const deleted = []
  const failed = []
  const touchedDirs = new Set()

  ;(absPaths || []).forEach(p => {
    try {
      fs.unlinkSync(p)
    } catch (e) {
      // fall through to the verify check — the file may already be gone
    }
    if (stillExists(p)) {
      failed.push({ path: p, reason: 'file still present after delete' })
    } else {
      deleted.push(p)
      touchedDirs.add(path.dirname(p))
    }
  })

  // Remove now-empty attachment folders (best-effort, never fatal).
  touchedDirs.forEach(dir => {
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
    } catch (e) {}
  })

  return Promise.resolve({ deleted, failed })
}

export default deleteAttachmentsVerified

import attachmentManagement from './attachmentManagement'
const resolveStorageData = require('./resolveStorageData')
const path = require('path')
const sander = require('sander')
const { findStorage } = require('browser/lib/findStorage')

function deleteNote(storageKey, noteKey) {
  let targetStorage
  try {
    targetStorage = findStorage(storageKey)
  } catch (e) {
    return Promise.reject(e)
  }

  return resolveStorageData(targetStorage)
    .then(function deleteNoteFile(storage) {
      const notePath = path.join(storage.path, 'notes', noteKey + '.cson')

      try {
        sander.unlinkSync(notePath)
      } catch (err) {
        console.warn('Failed to delete note cson', err)
      }
      return {
        noteKey,
        storageKey
      }
    })
    .then(function deleteAttachments(storageInfo) {
      attachmentManagement.deleteAttachmentFolder(
        storageInfo.storageKey,
        storageInfo.noteKey
      )
      return storageInfo
    })
}

// ESM export: this file is parsed as ESM (it has an import above), so a
// `module.exports =` assignment would be silently dropped by the Vite build
// and dataApi.deleteNote would be undefined at runtime.
export default deleteNote

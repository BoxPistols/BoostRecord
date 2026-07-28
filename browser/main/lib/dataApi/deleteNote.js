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

      const fss = require('fs')
      try {
        sander.unlinkSync(notePath)
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
        // File already gone before we tried — treat as success.
      }
      if (fss.existsSync(notePath)) {
        throw new Error(
          'Could not delete note file (permission denied?): ' + notePath
        )
      }
      return {
        noteKey,
        storageKey
      }
    })
    .then(function deleteAttachments(storageInfo) {
      // 添付はゴミ箱へ移すだけ（非同期）。ここで失敗してもノート自体の削除は
      // 済んでいるので、握りつぶして呼び出し元へ結果を返す
      return Promise.resolve(
        attachmentManagement.deleteAttachmentFolder(
          storageInfo.storageKey,
          storageInfo.noteKey
        )
      )
        .catch(err => {
          console.error('Could not move attachments to the trash', err)
        })
        .then(() => storageInfo)
    })
}

// ESM export: this file is parsed as ESM (it has an import above), so a
// `module.exports =` assignment would be silently dropped by the Vite build
// and dataApi.deleteNote would be undefined at runtime.
export default deleteNote

import attachmentManagement from './attachmentManagement'
const path = require('path')
const fs = require('fs')
const resolveStorageData = require('./resolveStorageData')
const resolveStorageNotes = require('./resolveStorageNotes')

const {
  DESTINATION_FOLDER,
  getAbsolutePathsOfAttachmentsInContent
} = attachmentManagement

/**
 * Enumerate every attachment file across the given storages, tagging each with
 * whether any note still references it (orphan detection). Powers the Image
 * Manager. Read-only.
 *
 * On-disk layout: <storagePath>/attachments/<noteKey>/<file>. A note references
 * an attachment via a ":storage/<noteKey>/<file>" placeholder in its markdown.
 *
 * @param {Array<Object>} storageList raw storages (from state.data.storageMap.toJS())
 * @returns {Promise<{attachments: Array, noteLoadFailed: boolean}>}
 *   attachments: [{ storageKey, storageName, noteKey, noteTitle|null, noteExists,
 *                   fileName, absPath, size, referenced }]
 *   noteLoadFailed: true if any storage's notes could not be fully read — in
 *                   that case the referenced set is incomplete, so callers must
 *                   NOT trust "orphan" for bulk deletion.
 */
function listAttachments(storageList) {
  let noteLoadFailed = false

  return Promise.all(
    (storageList || []).map(rawStorage =>
      resolveStorageData(rawStorage)
        .then(storage =>
          resolveStorageNotes(storage).then(notes =>
            collectForStorage(storage, notes)
          )
        )
        .catch(() => {
          // A storage that fails to resolve at all — skip it but flag the gap.
          noteLoadFailed = true
          return []
        })
    )
  ).then(perStorage => ({
    attachments: perStorage.reduce((acc, arr) => acc.concat(arr), []),
    noteLoadFailed
  }))

  function collectForStorage(storage, notes) {
    const attachmentsDir = path.join(storage.path, DESTINATION_FOLDER)

    // Safety: if some .cson notes failed to parse (e.g. OneDrive-corrupted
    // files), resolveStorageNotes silently returns fewer notes, so the
    // referenced set is incomplete and "orphan" cannot be trusted. Detect the
    // gap by comparing the on-disk .cson count with the notes we got back.
    try {
      const csonCount = fs
        .readdirSync(path.join(storage.path, 'notes'))
        .filter(f => /\.cson$/.test(f)).length
      if (notes.length < csonCount) noteLoadFailed = true
    } catch (e) {
      // no notes dir — nothing referenced, every attachment is an orphan, but
      // we can't be sure notes didn't exist elsewhere; stay conservative.
      noteLoadFailed = true
    }

    // Referenced absolute paths + noteKey -> note lookup.
    const referenced = new Set()
    const noteByKey = {}
    notes.forEach(note => {
      noteByKey[note.key] = note
      if (typeof note.content === 'string') {
        getAbsolutePathsOfAttachmentsInContent(
          note.content,
          storage.path
        ).forEach(p => referenced.add(path.normalize(p)))
      }
    })

    let noteKeyDirs
    try {
      noteKeyDirs = fs.readdirSync(attachmentsDir)
    } catch (e) {
      return [] // storage has no attachments folder yet
    }

    const result = []
    noteKeyDirs.forEach(noteKey => {
      const noteDir = path.join(attachmentsDir, noteKey)
      let files
      try {
        if (!fs.statSync(noteDir).isDirectory()) return
        files = fs.readdirSync(noteDir)
      } catch (e) {
        return
      }
      files.forEach(fileName => {
        const absPath = path.join(noteDir, fileName)
        let size
        try {
          const st = fs.statSync(absPath)
          if (!st.isFile()) return
          size = st.size
        } catch (e) {
          return
        }
        const note = noteByKey[noteKey]
        result.push({
          storageKey: storage.key,
          storageName: storage.name,
          noteKey,
          noteTitle: note ? note.title : null,
          noteExists: !!note,
          fileName,
          absPath,
          size,
          referenced: referenced.has(path.normalize(absPath))
        })
      })
    })
    return result
  }
}

export default listAttachments

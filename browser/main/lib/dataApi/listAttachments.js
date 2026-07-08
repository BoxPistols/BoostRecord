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
 * Enumerate every attachment across the given storages and classify each:
 *   - referenced: a note points at it and the file exists (healthy)
 *   - orphan:     the file exists but no note references it (safe to purge)
 *   - broken:     a note references it but the file is missing (unstable)
 * Each item also carries the list of notes that reference it. Read-only.
 *
 * @param {Array<Object>} storageList raw storages (state.data.storageMap.toJS() values)
 * @returns {Promise<{attachments: Array, noteLoadFailed: boolean}>}
 *   attachment = { storageKey, storageName, noteKey, fileName, absPath, size,
 *                  referenced, broken, referencingNotes: [{storageKey,noteKey,title}] }
 *   noteLoadFailed: some .cson could not be read -> referenced/orphan is unreliable
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

    // Detect partial note loads (OneDrive-corrupted .cson etc.): the referenced
    // set is then incomplete, so "orphan" must not be trusted for bulk delete.
    try {
      const csonCount = fs
        .readdirSync(path.join(storage.path, 'notes'))
        .filter(f => /\.cson$/.test(f)).length
      if (notes.length < csonCount) noteLoadFailed = true
    } catch (e) {
      noteLoadFailed = true
    }

    // Map normalized absolute path -> [notes that reference it].
    const referencedBy = new Map()
    notes.forEach(note => {
      if (typeof note.content !== 'string') return
      const ref = {
        storageKey: storage.key,
        noteKey: note.key,
        title: note.title
      }
      getAbsolutePathsOfAttachmentsInContent(
        note.content,
        storage.path
      ).forEach(p => {
        const key = path.normalize(p)
        if (!referencedBy.has(key)) referencedBy.set(key, [])
        referencedBy.get(key).push(ref)
      })
    })

    const result = []
    const seenOnDisk = new Set()

    let noteKeyDirs = []
    try {
      noteKeyDirs = fs.readdirSync(attachmentsDir)
    } catch (e) {
      noteKeyDirs = []
    }
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
        const norm = path.normalize(absPath)
        seenOnDisk.add(norm)
        const refs = referencedBy.get(norm) || []
        result.push({
          storageKey: storage.key,
          storageName: storage.name,
          noteKey,
          fileName,
          absPath,
          size,
          referenced: refs.length > 0,
          broken: false,
          referencingNotes: refs
        })
      })
    })

    // Broken: referenced by a note but no file on disk (existence-unstable).
    referencedBy.forEach((refs, norm) => {
      if (seenOnDisk.has(norm)) return
      result.push({
        storageKey: storage.key,
        storageName: storage.name,
        noteKey: path.basename(path.dirname(norm)),
        fileName: path.basename(norm),
        absPath: norm,
        size: 0,
        referenced: true,
        broken: true,
        referencingNotes: refs
      })
    })

    return result
  }
}

export default listAttachments

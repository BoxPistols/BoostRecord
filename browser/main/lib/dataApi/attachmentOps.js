import attachmentManagement from './attachmentManagement'
const fs = require('fs')
const path = require('path')
const sander = require('sander')
const CSON = require('@rokt33r/season')
const resolveStorageData = require('./resolveStorageData')
const resolveStorageNotes = require('./resolveStorageNotes')
const updateNote = require('./updateNote')
const { findStorage } = require('browser/lib/findStorage')

const { STORAGE_FOLDER_PLACEHOLDER } = attachmentManagement

// The markdown reference form for an attachment: ":storage/<noteKey>/<file>".
function placeholderFor(noteKey, fileName) {
  return STORAGE_FOLDER_PLACEHOLDER + '/' + noteKey + '/' + fileName
}

function noteMeta(note) {
  return { storageKey: note.storage, noteKey: note.key, title: note.title }
}

// Copy the current .cson of each note into a timestamped backup dir under
// userData, so any reference-rewrite is reversible. Returns the backup dir.
function backupNotes(storagePath, notes) {
  const remote = require('@electron/remote')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(remote.app.getPath('userData'), 'media-backups', stamp)
  sander.mkdirSync(dir)
  notes.forEach(note => {
    const src = path.join(storagePath, 'notes', note.key + '.cson')
    try {
      fs.copyFileSync(
        src,
        path.join(dir, note.storage + '_' + note.key + '.cson')
      )
    } catch (e) {
      /* best-effort */
    }
  })
  return dir
}

// Resolve a storage (with .path + notes) from a storage key.
function resolve(storageKey) {
  let raw
  try {
    raw = findStorage(storageKey)
  } catch (e) {
    return Promise.reject(e)
  }
  return resolveStorageData(raw).then(storage =>
    resolveStorageNotes(storage).then(notes => ({ storage, notes }))
  )
}

// Notes whose content contains the given ":storage/..." placeholder.
function referencing(notes, placeholder) {
  return notes.filter(
    n => typeof n.content === 'string' && n.content.indexOf(placeholder) !== -1
  )
}

// Rewrite oldPl -> newPl in every referencing note, persist, return updated notes.
function rewriteRefs(storage, affected, oldPl, newPl) {
  return Promise.all(
    affected.map(note => {
      const next = Object.assign({}, note, {
        content: note.content.split(oldPl).join(newPl)
      })
      return updateNote(storage.key, note.key, next)
    })
  )
}

/**
 * Rename an attachment file and re-point every note that references it.
 * dryRun: returns { affected } without touching anything.
 */
function renameAttachment({ storageKey, noteKey, oldName, newName, dryRun }) {
  return resolve(storageKey).then(({ storage, notes }) => {
    const oldPl = placeholderFor(noteKey, oldName)
    const newPl = placeholderFor(noteKey, newName)
    const affected = referencing(notes, oldPl)
    if (dryRun) return { affected: affected.map(noteMeta) }

    const dir = path.join(storage.path, 'attachments', noteKey)
    const backupDir = backupNotes(storage.path, affected)
    fs.renameSync(path.join(dir, oldName), path.join(dir, newName))
    return rewriteRefs(storage, affected, oldPl, newPl).then(updated => ({
      affected: affected.map(noteMeta),
      updatedNotes: updated,
      backupDir
    }))
  })
}

/**
 * Move an attachment to another note (same storage) and re-point references.
 * dryRun: returns { affected }.
 */
function moveAttachment({
  storageKey,
  srcNoteKey,
  fileName,
  dstNoteKey,
  dryRun
}) {
  return resolve(storageKey).then(({ storage, notes }) => {
    const oldPl = placeholderFor(srcNoteKey, fileName)
    const newPl = placeholderFor(dstNoteKey, fileName)
    const affected = referencing(notes, oldPl)
    if (dryRun) return { affected: affected.map(noteMeta) }

    const backupDir = backupNotes(storage.path, affected)
    const srcDir = path.join(storage.path, 'attachments', srcNoteKey)
    const dstDir = path.join(storage.path, 'attachments', dstNoteKey)
    sander.mkdirSync(dstDir)
    fs.renameSync(path.join(srcDir, fileName), path.join(dstDir, fileName))
    return rewriteRefs(storage, affected, oldPl, newPl).then(updated => ({
      affected: affected.map(noteMeta),
      updatedNotes: updated,
      backupDir
    }))
  })
}

/**
 * Replace an attachment's bytes with another file, keeping the same name and
 * references (so no markdown rewrite is needed). Backs up the old file.
 */
function replaceAttachment({ absPath, newFilePath }) {
  const remote = require('@electron/remote')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(remote.app.getPath('userData'), 'media-backups', stamp)
  sander.mkdirSync(dir)
  try {
    fs.copyFileSync(absPath, path.join(dir, path.basename(absPath) + '.bak'))
  } catch (e) {
    /* best-effort */
  }
  fs.copyFileSync(newFilePath, absPath)
  return Promise.resolve({ backupDir: dir })
}

export default {
  renameAttachment,
  moveAttachment,
  replaceAttachment
}

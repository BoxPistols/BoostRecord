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

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Rewrite oldPl -> newPl in every referencing note, persist, return updated
// notes. When oldName/newName are given (rename), also refresh the markdown alt
// text `![oldName](oldPl)` -> `![newName](newPl)` so the editor stops showing
// the stale auto-generated name; any other occurrence (custom alt / bare link)
// still gets its path updated.
function rewriteRefs(storage, affected, oldPl, newPl, oldName, newName) {
  const altRe =
    oldName && newName
      ? new RegExp(
          '!\\[' + escapeRe(oldName) + '\\]\\(' + escapeRe(oldPl) + '\\)',
          'g'
        )
      : null
  return Promise.all(
    affected.map(note => {
      let content = note.content
      if (altRe)
        content = content.replace(altRe, '![' + newName + '](' + newPl + ')')
      content = content.split(oldPl).join(newPl)
      const next = Object.assign({}, note, { content })
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
    return rewriteRefs(storage, affected, oldPl, newPl, oldName, newName).then(
      updated => ({
        affected: affected.map(noteMeta),
        updatedNotes: updated,
        backupDir
      })
    )
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

/**
 * Remove every in-note markdown reference to a broken (missing) attachment.
 * Strips `![alt](:storage/noteKey/file)` entirely, degrades
 * `[text](:storage/noteKey/file)` to bare text, and removes any
 * remaining bare placeholders. Backs up affected notes first.
 */
function removeBrokenReferences({ storageKey, noteKey, fileName }) {
  return resolve(storageKey).then(({ storage, notes }) => {
    const placeholder = placeholderFor(noteKey, fileName)
    const affected = referencing(notes, placeholder)
    if (affected.length === 0) return { updatedNotes: [], backupDir: null }
    const backupDir = backupNotes(storage.path, affected)
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const reImg = new RegExp('!\\[[^\\]]*\\]\\(' + escaped + '\\)', 'g')
    const reLink = new RegExp('\\[([^\\]]*)\\]\\(' + escaped + '\\)', 'g')
    const reBare = new RegExp(escaped, 'g')
    return Promise.all(
      affected.map(note => {
        let content = note.content
        content = content.replace(reImg, '')
        content = content.replace(reLink, '$1')
        content = content.replace(reBare, '')
        const next = Object.assign({}, note, { content })
        return updateNote(storage.key, note.key, next)
      })
    ).then(updated => ({ updatedNotes: updated, backupDir }))
  })
}

export default {
  renameAttachment,
  moveAttachment,
  replaceAttachment,
  removeBrokenReferences
}

import dataApi from 'browser/main/lib/dataApi'

/**
 * Move a set of notes into (targetStorageKey, targetFolderKey).
 *
 * Shared by the note-list drag-and-drop drop target and the note context-menu
 * "Move to Folder" action so both go through one verified path: skip notes that
 * are already in the exact target, move the rest, then dispatch MOVE_NOTE so the
 * store (and note list / folder counts) update immediately.
 *
 * @param {Array<Object>} notes full note objects (need storage/key/content)
 * @param {string} targetStorageKey
 * @param {string} targetFolderKey
 * @param {Function} dispatch redux dispatch
 * @returns {Promise<Array>} resolves with the moved notes (empty if nothing moved)
 */
export function moveNotesToFolder(
  notes,
  targetStorageKey,
  targetFolderKey,
  dispatch
) {
  // Keep only notes that are NOT already in the exact target (storage + folder).
  const toMove = notes.filter(
    note => note.storage !== targetStorageKey || note.folder !== targetFolderKey
  )
  if (toMove.length === 0) return Promise.resolve([])

  return Promise.all(
    toMove.map(note =>
      dataApi.moveNote(
        note.storage,
        note.key,
        targetStorageKey,
        targetFolderKey
      )
    )
  )
    .then(movedNotes => {
      // Promise.all preserves order, so movedNotes[i] is the result of moving
      // toMove[i]. Pair them by index — matching by content is unreliable
      // (identical-content notes, or content changed on disk between drag/drop)
      // and an unmatched find() would dispatch originNote:undefined and crash
      // the MOVE_NOTE reducer.
      movedNotes.forEach((newNote, index) => {
        dispatch({
          type: 'MOVE_NOTE',
          originNote: toMove[index],
          note: newNote
        })
      })
      return movedNotes
    })
    .catch(err => {
      // Fire-and-forget from the UI; log only (do not reject — no caller awaits).
      console.error(`Failed to move notes: ${err}`)
    })
}

export default moveNotesToFolder

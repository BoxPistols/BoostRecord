import exportFolder from './exportFolder'
import exportStorage from './exportStorage'
import createNoteFromUrl from './createNoteFromUrl'
import exportNoteAs from './exportNoteAs'
import createSnippet from './createSnippet'
import deleteSnippet from './deleteSnippet'
import updateSnippet from './updateSnippet'
import fetchSnippet from './fetchSnippet'
import exportTag from './exportTag'
import getFilename from './getFilename'
// These three are ESM-default-only (they contain imports, so their old
// `module.exports =` was silently dropped by the Vite build — require() here
// yielded an empty module and e.g. dataApi.moveNote crashed at runtime).
import deleteFolder from './deleteFolder'
import deleteNote from './deleteNote'
import moveNote from './moveNote'

const dataApi = {
  init: require('./init'),
  toggleStorage: require('./toggleStorage'),
  addStorage: require('./addStorage'),
  renameStorage: require('./renameStorage'),
  removeStorage: require('./removeStorage'),
  createFolder: require('./createFolder'),
  updateFolder: require('./updateFolder'),
  deleteFolder,
  reorderFolder: require('./reorderFolder'),
  exportFolder,
  exportStorage,
  createNote: require('./createNote'),
  createNoteFromUrl,
  updateNote: require('./updateNote'),
  deleteNote,
  moveNote,
  exportNoteAs,
  migrateFromV5Storage: require('./migrateFromV5Storage'),
  createSnippet,
  deleteSnippet,
  updateSnippet,
  fetchSnippet,
  exportTag,
  getFilename,

  _migrateFromV6Storage: require('./migrateFromV6Storage'),
  _resolveStorageData: require('./resolveStorageData'),
  _resolveStorageNotes: require('./resolveStorageNotes')
}

export default dataApi

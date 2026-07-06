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

const dataApi = {
  init: require('./init'),
  toggleStorage: require('./toggleStorage'),
  addStorage: require('./addStorage'),
  renameStorage: require('./renameStorage'),
  removeStorage: require('./removeStorage'),
  createFolder: require('./createFolder'),
  updateFolder: require('./updateFolder'),
  deleteFolder: require('./deleteFolder'),
  reorderFolder: require('./reorderFolder'),
  exportFolder,
  exportStorage,
  createNote: require('./createNote'),
  createNoteFromUrl,
  updateNote: require('./updateNote'),
  deleteNote: require('./deleteNote'),
  moveNote: require('./moveNote'),
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

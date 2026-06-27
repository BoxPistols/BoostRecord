import { data, defaultDataMap } from 'browser/main/dataReducer'

const makeNote = (over = {}) =>
  Object.assign(
    {
      key: 'n1',
      storage: 's1',
      folder: 'f1',
      tags: [],
      isStarred: false,
      isTrashed: false
    },
    over
  )

const initWith = (storages, notes) =>
  data(undefined, { type: 'INIT_ALL', storages, notes })

it('MOVE_NOTE moves a note into the destination folder index', () => {
  let state = data(defaultDataMap(), {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1', folder: 'f1' })
  })
  state = data(state, {
    type: 'MOVE_NOTE',
    originNote: makeNote({ key: 'n1', folder: 'f1' }),
    note: makeNote({ key: 'n1', folder: 'f2' })
  })
  expect(state.noteMap.get('n1').folder).toBe('f2')
  expect(state.folderNoteMap.get('s1-f2').toJS()).toContain('n1')
  expect(state.folderNoteMap.get('s1-f1').toJS()).not.toContain('n1')
})

it('REMOVE_STORAGE removes the storage and its notes', () => {
  let state = initWith(
    [{ key: 's1', folders: [] }],
    [makeNote({ key: 'n1', tags: ['t1'] })]
  )
  state = data(state, { type: 'REMOVE_STORAGE', storageKey: 's1' })
  expect(state.storageMap.has('s1')).toBe(false)
  expect(state.noteMap.has('n1')).toBe(false)
})

it('ADD_STORAGE indexes its notes into storageNoteMap, not tagNoteMap', () => {
  const state = data(defaultDataMap(), {
    type: 'ADD_STORAGE',
    storage: { key: 's1' },
    notes: [makeNote({ key: 'n1', storage: 's1' })]
  })
  // The note must be registered under the storage's note set...
  expect(state.storageNoteMap.get('s1').toJS()).toContain('n1')
  // ...and the tag map must not be polluted with a storage-keyed entry.
  expect(state.tagNoteMap.has('s1')).toBe(false)
})

it('DELETE_FOLDER removes the folder index and its notes', () => {
  let state = initWith(
    [{ key: 's1', folders: [{ key: 'f1' }] }],
    [makeNote({ key: 'n1', folder: 'f1' })]
  )
  state = data(state, {
    type: 'DELETE_FOLDER',
    storage: { key: 's1', folders: [] },
    folderKey: 'f1'
  })
  expect(state.folderNoteMap.has('s1-f1')).toBe(false)
  expect(state.noteMap.has('n1')).toBe(false)
})

it('EXPAND_STORAGE sets the storage open flag', () => {
  let state = data(defaultDataMap(), {
    type: 'ADD_STORAGE',
    storage: { key: 's1', isOpen: false },
    notes: []
  })
  state = data(state, {
    type: 'EXPAND_STORAGE',
    storage: { key: 's1' },
    isOpen: true
  })
  expect(state.storageMap.get('s1').isOpen).toBe(true)
})

it('UPDATE_FOLDER replaces the storage entry', () => {
  const state = data(defaultDataMap(), {
    type: 'UPDATE_FOLDER',
    storage: { key: 's1', name: 'Renamed' }
  })
  expect(state.storageMap.get('s1').name).toBe('Renamed')
})

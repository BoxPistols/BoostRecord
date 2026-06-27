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

it('defaultDataMap returns empty collections', () => {
  const state = defaultDataMap()
  expect(state.noteMap.size).toBe(0)
  expect(state.storageMap.size).toBe(0)
  expect(state.starredSet.size).toBe(0)
})

it('returns the same state for an unknown action', () => {
  const state = defaultDataMap()
  expect(data(state, { type: 'UNKNOWN' })).toBe(state)
})

it('INIT_ALL populates storages, notes, stars, folders and tags', () => {
  const state = data(undefined, {
    type: 'INIT_ALL',
    storages: [{ key: 's1' }],
    notes: [makeNote({ key: 'n1', isStarred: true, tags: ['t1'] })]
  })
  expect(state.storageMap.has('s1')).toBe(true)
  expect(state.noteMap.has('n1')).toBe(true)
  expect(state.starredSet.toJS()).toContain('n1')
  expect(state.storageNoteMap.get('s1').toJS()).toContain('n1')
  expect(state.folderNoteMap.get('s1-f1').toJS()).toContain('n1')
  expect(state.tagNoteMap.get('t1').toJS()).toContain('n1')
})

it('ADD_STORAGE registers the storage with an empty note set', () => {
  const state = data(defaultDataMap(), {
    type: 'ADD_STORAGE',
    storage: { key: 's1' },
    notes: []
  })
  expect(state.storageMap.has('s1')).toBe(true)
  expect(state.storageNoteMap.get('s1').size).toBe(0)
})

it('UPDATE_NOTE inserts a new note and indexes it', () => {
  const state = data(defaultDataMap(), {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1', isStarred: true, tags: ['x'] })
  })
  expect(state.noteMap.get('n1').key).toBe('n1')
  expect(state.starredSet.toJS()).toContain('n1')
  expect(state.folderNoteMap.get('s1-f1').toJS()).toContain('n1')
  expect(state.tagNoteMap.get('x').toJS()).toContain('n1')
})

it('UPDATE_NOTE moving a note to trash removes it from starred', () => {
  let state = data(defaultDataMap(), {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1', isStarred: true })
  })
  state = data(state, {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1', isStarred: true, isTrashed: true })
  })
  expect(state.trashedSet.toJS()).toContain('n1')
  expect(state.starredSet.toJS()).not.toContain('n1')
})

it('DELETE_NOTE removes the note from the note map', () => {
  let state = data(defaultDataMap(), {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1' })
  })
  state = data(state, { type: 'DELETE_NOTE', noteKey: 'n1' })
  expect(state.noteMap.has('n1')).toBe(false)
})

it('does not mutate the previous state object on UPDATE_NOTE', () => {
  const prev = defaultDataMap()
  const next = data(prev, {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1' })
  })
  expect(next).not.toBe(prev)
  expect(prev.noteMap.has('n1')).toBe(false)
})

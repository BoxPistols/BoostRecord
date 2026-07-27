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

// --- Bookmark（#102）: isStarred と同じ形の索引を別軸で持つ ---

it('defaultDataMap は bookmarkedSet を持つ', () => {
  expect(defaultDataMap().bookmarkedSet.size).toBe(0)
})

it('INIT_ALL で isBookmarked のノートが bookmarkedSet に入る', () => {
  const state = data(undefined, {
    type: 'INIT_ALL',
    storages: [{ key: 's1' }],
    notes: [
      makeNote({ key: 'n1', isBookmarked: true }),
      makeNote({ key: 'n2' })
    ]
  })
  expect(state.bookmarkedSet.toJS()).toEqual(['n1'])
})

it('isBookmarked を持たない既存ノートは未設定＝false として扱う', () => {
  const note = makeNote({ key: 'n1' })
  delete note.isBookmarked
  const state = data(undefined, {
    type: 'INIT_ALL',
    storages: [{ key: 's1' }],
    notes: [note]
  })
  expect(state.bookmarkedSet.size).toBe(0)

  // undefined → false への更新で誤って delete/add が走らないこと
  const next = data(state, {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1', isBookmarked: false })
  })
  expect(next.bookmarkedSet.size).toBe(0)
})

it('UPDATE_NOTE で bookmarkedSet が追従する', () => {
  let state = data(undefined, {
    type: 'INIT_ALL',
    storages: [{ key: 's1' }],
    notes: [makeNote({ key: 'n1' })]
  })
  state = data(state, {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1', isBookmarked: true })
  })
  expect(state.bookmarkedSet.toJS()).toEqual(['n1'])

  state = data(state, {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1', isBookmarked: false })
  })
  expect(state.bookmarkedSet.size).toBe(0)
})

it('ゴミ箱へ移すと bookmarkedSet から外れ、戻すと復帰する', () => {
  let state = data(undefined, {
    type: 'INIT_ALL',
    storages: [{ key: 's1' }],
    notes: [makeNote({ key: 'n1', isBookmarked: true })]
  })
  state = data(state, {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1', isBookmarked: true, isTrashed: true })
  })
  expect(state.bookmarkedSet.size).toBe(0)

  state = data(state, {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1', isBookmarked: true, isTrashed: false })
  })
  expect(state.bookmarkedSet.toJS()).toEqual(['n1'])
})

it('ブックマークとスターは互いに影響しない', () => {
  let state = data(undefined, {
    type: 'INIT_ALL',
    storages: [{ key: 's1' }],
    notes: [makeNote({ key: 'n1', isStarred: true })]
  })
  state = data(state, {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1', isStarred: true, isBookmarked: true })
  })
  expect(state.starredSet.toJS()).toEqual(['n1'])
  expect(state.bookmarkedSet.toJS()).toEqual(['n1'])

  state = data(state, {
    type: 'UPDATE_NOTE',
    note: makeNote({ key: 'n1', isStarred: false, isBookmarked: true })
  })
  expect(state.starredSet.size).toBe(0)
  expect(state.bookmarkedSet.toJS()).toEqual(['n1'])
})

it('DELETE_NOTE で bookmarkedSet からも除かれる', () => {
  let state = data(undefined, {
    type: 'INIT_ALL',
    storages: [{ key: 's1' }],
    notes: [makeNote({ key: 'n1', isBookmarked: true })]
  })
  state = data(state, {
    type: 'DELETE_NOTE',
    storageKey: 's1',
    noteKey: 'n1'
  })
  expect(state.bookmarkedSet.size).toBe(0)
})

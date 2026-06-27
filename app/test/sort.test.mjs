import test from 'node:test'
import assert from 'node:assert/strict'
import { sortNotes } from '../src/data/sort.ts'

const note = (key, over) => ({
  key,
  type: 'MARKDOWN_NOTE',
  title: '',
  content: '',
  tags: [],
  storage: 's',
  folder: 'f',
  isStarred: false,
  isTrashed: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...over
})

const notes = [
  note('a', {
    title: 'Banana',
    createdAt: '2025-01-03T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  }),
  note('b', {
    title: 'Apple',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-03T00:00:00.000Z'
  }),
  note('c', {
    title: 'Cherry',
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z'
  })
]

const keys = arr => arr.map(n => n.key)

test('updated desc/asc', () => {
  assert.deepEqual(keys(sortNotes(notes, 'updated', 'desc')), ['b', 'c', 'a'])
  assert.deepEqual(keys(sortNotes(notes, 'updated', 'asc')), ['a', 'c', 'b'])
})

test('created desc/asc', () => {
  assert.deepEqual(keys(sortNotes(notes, 'created', 'desc')), ['a', 'c', 'b'])
  assert.deepEqual(keys(sortNotes(notes, 'created', 'asc')), ['b', 'c', 'a'])
})

test('title asc/desc (locale compare)', () => {
  assert.deepEqual(keys(sortNotes(notes, 'title', 'asc')), ['b', 'a', 'c'])
  assert.deepEqual(keys(sortNotes(notes, 'title', 'desc')), ['c', 'a', 'b'])
})

test('does not mutate the input array', () => {
  const before = keys(notes)
  sortNotes(notes, 'title', 'asc')
  assert.deepEqual(keys(notes), before)
})

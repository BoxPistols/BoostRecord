import test from 'node:test'
import assert from 'node:assert/strict'
import { queryTerms, noteMatches, filterByQuery } from '../src/data/search.ts'

const note = (over) => ({
  key: 'k',
  type: 'MARKDOWN_NOTE',
  title: 'Hello World',
  content: '# Hello\n\nThe quick brown fox',
  tags: ['draft', 'fox'],
  storage: 's',
  folder: 'f',
  isStarred: false,
  isTrashed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over
})

test('queryTerms splits, lowercases and drops blanks', () => {
  assert.deepEqual(queryTerms('  Quick   Brown '), ['quick', 'brown'])
  assert.deepEqual(queryTerms(''), [])
  assert.deepEqual(queryTerms('   '), [])
})

test('noteMatches: empty terms always match', () => {
  assert.equal(noteMatches(note(), []), true)
})

test('noteMatches matches across title, content and tags', () => {
  // Terms are pre-lowercased by queryTerms; noteMatches lowercases the haystack.
  assert.equal(noteMatches(note(), ['hello']), true) // title
  assert.equal(noteMatches(note(), ['brown']), true) // content
  assert.equal(noteMatches(note(), ['draft']), true) // tag
})

test('filterByQuery is case-insensitive (via queryTerms)', () => {
  assert.equal(filterByQuery([note()], 'HELLO').length, 1)
  assert.equal(filterByQuery([note()], 'Brown Fox').length, 1)
})

test('noteMatches requires every term (AND)', () => {
  assert.equal(noteMatches(note(), ['hello', 'fox']), true)
  assert.equal(noteMatches(note(), ['hello', 'missing']), false)
})

test('filterByQuery returns input unchanged for blank query', () => {
  const notes = [note({ key: 'a' }), note({ key: 'b' })]
  assert.equal(filterByQuery(notes, '   '), notes)
})

test('filterByQuery keeps only matching notes', () => {
  const notes = [
    note({ key: 'a', title: 'Apple pie' }),
    note({ key: 'b', title: 'Banana split', content: '', tags: [] })
  ]
  const got = filterByQuery(notes, 'banana')
  assert.equal(got.length, 1)
  assert.equal(got[0].key, 'b')
})

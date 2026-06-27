import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTag, addTag, removeTag } from '../src/data/tags.ts'

test('normalizeTag trims and hyphenates inner whitespace', () => {
  assert.equal(normalizeTag('  hello  '), 'hello')
  assert.equal(normalizeTag('to do'), 'to-do')
  assert.equal(normalizeTag('a   b\tc'), 'a-b-c')
  assert.equal(normalizeTag('   '), '')
})

test('addTag appends non-empty, deduped, order preserved', () => {
  assert.deepEqual(addTag(['a'], 'b'), ['a', 'b'])
  assert.deepEqual(addTag(['a'], '  a '), ['a']) // dup after normalize
  assert.deepEqual(addTag(['a'], '   '), ['a']) // empty ignored
  assert.deepEqual(addTag([], 'in progress'), ['in-progress'])
})

test('addTag returns the same array when nothing is added', () => {
  const tags = ['a']
  assert.equal(addTag(tags, 'a'), tags)
  assert.equal(addTag(tags, ''), tags)
})

test('removeTag removes a tag, no-op when absent', () => {
  assert.deepEqual(removeTag(['a', 'b'], 'a'), ['b'])
  const tags = ['a', 'b']
  assert.equal(removeTag(tags, 'z'), tags) // unchanged reference
})

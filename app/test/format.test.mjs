import test from 'node:test'
import assert from 'node:assert/strict'
import { toggleWrap, makeLink } from '../src/markdown/format.ts'

test('toggleWrap adds markers around a selection', () => {
  const r = toggleWrap('bold', '**')
  assert.equal(r.text, '**bold**')
  assert.equal(r.selFrom, 2)
  assert.equal(r.selTo, 6) // selection stays on "bold"
})

test('toggleWrap removes markers when already wrapped', () => {
  const r = toggleWrap('**bold**', '**')
  assert.equal(r.text, 'bold')
  assert.equal(r.selFrom, 0)
  assert.equal(r.selTo, 4)
})

test('toggleWrap on empty selection puts the cursor between markers', () => {
  const r = toggleWrap('', '*')
  assert.equal(r.text, '**')
  assert.equal(r.selFrom, 1)
  assert.equal(r.selTo, 1)
})

test('toggleWrap italic with single asterisk', () => {
  assert.equal(toggleWrap('x', '*').text, '*x*')
  assert.equal(toggleWrap('*x*', '*').text, 'x')
})

test('makeLink wraps selection and selects the url placeholder', () => {
  const r = makeLink('text')
  assert.equal(r.text, '[text](url)')
  assert.equal(r.text.slice(r.selFrom, r.selTo), 'url')
})

test('makeLink with empty selection', () => {
  const r = makeLink('')
  assert.equal(r.text, '[](url)')
  assert.equal(r.text.slice(r.selFrom, r.selTo), 'url')
})

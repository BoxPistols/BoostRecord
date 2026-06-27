import test from 'node:test'
import assert from 'node:assert/strict'
import { exportFilename } from '../src/data/exportMarkdown.ts'

test('uses the title as the filename', () => {
  assert.equal(exportFilename({ title: 'My Note' }), 'My Note.md')
})

test('replaces filesystem-reserved characters', () => {
  assert.equal(exportFilename({ title: 'a/b:c*d?e"f<g>h|i' }), 'a_b_c_d_e_f_g_h_i.md')
})

test('collapses whitespace and trims', () => {
  assert.equal(exportFilename({ title: '  hello   world  ' }), 'hello world.md')
})

test('falls back to untitled for an empty/blank title', () => {
  assert.equal(exportFilename({ title: '' }), 'untitled.md')
  assert.equal(exportFilename({ title: '   ' }), 'untitled.md')
})

test('caps very long titles', () => {
  const name = exportFilename({ title: 'x'.repeat(200) })
  assert.ok(name.length <= 83) // 80 chars + ".md"
  assert.ok(name.endsWith('.md'))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDate, formatDateTime, sortLinesText } from '../src/markdown/editorText.ts'

test('ISO 8601 の日付はその土地の日付で、UTC にずらさない', () => {
  const d = new Date(2026, 0, 5, 1, 2, 3) // 現地の 1 月 5 日 1:02:03
  assert.equal(formatDate(d, true), '2026-01-05')
  assert.match(formatDateTime(d, true), /^2026-01-05T01:02:03[+-]\d\d:\d\d$/)
})

test('ISO を使わないときは現地の書式（デスクトップ版と同じ）', () => {
  const d = new Date(2026, 9, 29, 9, 5)
  assert.equal(formatDate(d, false), d.toLocaleDateString())
  assert.equal(formatDateTime(d, false), d.toLocaleString())
})

test('sortLinesText は行を並べ替え、末尾の改行を残す', () => {
  assert.equal(sortLinesText('c\na\nb'), 'a\nb\nc')
  assert.equal(sortLinesText('b\na\n'), 'a\nb\n')
})

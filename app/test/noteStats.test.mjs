// 情報パネルの文字数・単語数・日時
import test from 'node:test'
import assert from 'node:assert/strict'
import { countLetters, countWords, formatDateTime } from '../src/noteStats.ts'

test('文字数は改行を除き、絵文字や結合文字も見えている 1 文字を 1 と数える', () => {
  assert.equal(countLetters(''), 0)
  assert.equal(countLetters('ab\ncd\r\ne'), 5)
  assert.equal(countLetters('日本語 です'), 6)
  assert.equal(countLetters('👍🏽が'), 2)
})

test('単語は日本語でも語に分けて数え、記号と空白は数えない', () => {
  assert.equal(countWords(''), 0)
  assert.equal(countWords('   \n '), 0)
  assert.equal(countWords('hello, world!'), 2)
  assert.equal(countWords('# Title\n\n- [ ] task'), 2)
  assert.ok(countWords('今日は良い天気です') > 1)
})

test('日時は年/月/日 時:分。壊れた値はそのまま', () => {
  const d = new Date(2026, 9, 31, 9, 5)
  assert.equal(formatDateTime(d.toISOString()), '2026/10/31 9:05')
  assert.equal(formatDateTime('not a date'), 'not a date')
})

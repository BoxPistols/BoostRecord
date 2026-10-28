// ノート内検索の当たり判定。デスクトップ版（tests/lib/findInText.test.js）と同じ判定であることを固定する。
// エディタとプレビューで共通に使うので、ここがずれると片方だけ件数が合わない形で壊れる
import test from 'node:test'
import assert from 'node:assert/strict'
import { findMatches, formatCount, indexAfter, stepIndex } from '../src/find/findInText.ts'

test('位置を先頭から順に返し、既定は大文字小文字を区別しない', () => {
  assert.deepEqual(findMatches('needle x needle', 'needle'), [
    { start: 0, end: 6 },
    { start: 9, end: 15 }
  ])
  assert.equal(findMatches('Needle NEEDLE', 'needle').length, 2)
  assert.deepEqual(findMatches('Needle NEEDLE needle', 'needle', { caseSensitive: true }), [
    { start: 14, end: 20 }
  ])
})

test('重なる一致は数えず、日本語でも位置がずれない', () => {
  assert.deepEqual(findMatches('aaa', 'aa'), [{ start: 0, end: 2 }])
  const text = 'これは検索の検索です'
  const hits = findMatches(text, '検索')
  assert.deepEqual(hits, [
    { start: 3, end: 5 },
    { start: 6, end: 8 }
  ])
  for (const h of hits) assert.equal(text.slice(h.start, h.end), '検索')
  assert.equal(findMatches('ABC ＡＢＣ', 'ABC').length, 1)
})

test('空クエリ・壊れた入力は 0 件、長さの変わる文字では位置を優先する', () => {
  assert.deepEqual(findMatches('anything', ''), [])
  assert.deepEqual(findMatches(undefined, 'a'), [])
  assert.deepEqual(findMatches(null, null), [])
  const text = 'straße'
  for (const h of findMatches(text, 'ß')) assert.equal(text.slice(h.start, h.end), 'ß')
})

test('複数行の検索語は、改行の数や空行の違いを越えて並びで見つける', () => {
  const text = '【業務内容】\n今回は、モックの作成です。\n\n・画面イメージの作成'
  const hits = findMatches(text, '今回は、モックの作成です。\n・画面イメージの作成')
  assert.equal(hits.length, 1)
  assert.equal(text.slice(hits[0].start, hits[0].end), '今回は、モックの作成です。\n\n・画面イメージの作成')
  // プレビューのようにブロックの間に文字が無くても見つける
  assert.equal(findMatches('【業務内容】今回は、モックの作成です。', '【業務内容】\n今回は').length, 1)
  assert.equal(findMatches('a  b\na b', 'a b').length, 2)
  assert.equal(findMatches('ab', 'a b').length, 0)
  assert.equal(findMatches('価格(税込) 1.5倍\n価格X税込Y 105倍', '(税込) 1.5').length, 1)
  assert.equal(findMatches('a b c', ' ').length, 2)
})

test('次へ・前へは端で回り込み、未選択からは先頭か末尾へ', () => {
  assert.equal(stepIndex(0, 3, 1), 1)
  assert.equal(stepIndex(2, 3, 1), 0)
  assert.equal(stepIndex(0, 3, -1), 2)
  assert.equal(stepIndex(-1, 3, 1), 0)
  assert.equal(stepIndex(-1, 3, -1), 2)
  assert.equal(stepIndex(0, 0, 1), -1)
})

test('置換の後は、置き換えた位置以降の最初の一致を選ぶ', () => {
  const m = [
    { start: 2, end: 4 },
    { start: 10, end: 12 }
  ]
  assert.equal(indexAfter(m, 5), 1)
  assert.equal(indexAfter(m, 2), 0)
  // 後ろに無ければ先頭へ回り込む
  assert.equal(indexAfter(m, 20), 0)
  assert.equal(indexAfter([], 0), -1)
})

test('件数は 1 起点で、未選択と 0 件を区別して出す', () => {
  assert.equal(formatCount(0, 17), '1 / 17')
  assert.equal(formatCount(-1, 17), '0 / 17')
  assert.equal(formatCount(-1, 0), '0 / 0')
})

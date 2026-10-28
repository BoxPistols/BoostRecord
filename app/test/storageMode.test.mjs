// ブラウザでの保存先の選び方。フォルダを選ばなくても、開いてすぐ書けること
import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseBrowserStorage } from '../src/data/storageMode.ts'

test('Chrome・Edge でも、既定はブラウザの中（フォルダを選ばずに書ける）', () => {
  assert.equal(chooseBrowserStorage({ fsa: true, opfs: true, mode: 'browser' }), 'browser')
})

test('フォルダで使うと選んだときだけ、PC のフォルダを読み書きする', () => {
  assert.equal(chooseBrowserStorage({ fsa: true, opfs: true, mode: 'folder' }), 'folder')
})

test('フォルダを選べないブラウザでは、フォルダの指定があってもブラウザの中', () => {
  assert.equal(chooseBrowserStorage({ fsa: false, opfs: true, mode: 'folder' }), 'browser')
})

test('保存先がどちらも無ければ見本データ', () => {
  assert.equal(chooseBrowserStorage({ fsa: false, opfs: false, mode: 'browser' }), 'memory')
  assert.equal(chooseBrowserStorage({ fsa: true, opfs: false, mode: 'browser' }), 'folder')
})

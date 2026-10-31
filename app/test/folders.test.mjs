// フォルダの作成と改名（デスクトップ版の createFolder / updateFolder / renameFolderPaths と同じ規則）
import test from 'node:test'
import assert from 'node:assert/strict'
import { createFolder, renameFolder, folderKey, splitPath, FOLDER_COLORS } from '../src/data/folders.ts'

const base = [
  { key: 'a', name: 'Work', color: '#E10051', extra: 1 },
  { key: 'b', name: 'Work/Notes', color: '#2BA5F7' },
  { key: 'c', name: 'Private', color: '#3FD941' }
]

test('パスは前後の空白と空の区切りを落として揃える', () => {
  assert.deepEqual(splitPath(' A / /B/ '), ['A', 'B'])
  assert.deepEqual(splitPath(' / '), [])
  assert.deepEqual(splitPath(1), [])
})

test('作る: 名前を揃えて末尾に足し、キーは既存と重ならない', () => {
  const keys = ['a', 'a', 'new']
  const r = createFolder(base, { name: ' Ideas / 2026 ', color: '#7C4DFF' }, () => keys.shift())
  assert.equal(r.ok, true)
  assert.equal(r.key, 'new')
  assert.deepEqual(r.folders.at(-1), { key: 'new', color: '#7C4DFF', name: 'Ideas/2026' })
  assert.equal(r.folders.length, 4)
})

test('作る: 空の名前と、同じパスのフォルダは断る', () => {
  assert.deepEqual(createFolder(base, { name: ' / ', color: '#000' }), { ok: false, error: 'EMPTY_NAME' })
  assert.deepEqual(createFolder(base, { name: 'work / notes ', color: '#000' }).ok, true)
  assert.deepEqual(createFolder(base, { name: ' Work / Notes ', color: '#000' }), { ok: false, error: 'PATH_CLASH' })
})

test('改名: 子孫も同じ接頭辞で付け替え、知らない項目は残す', () => {
  const r = renameFolder(base, 'a', 'Job')
  assert.equal(r.ok, true)
  assert.deepEqual(r.folders.map(f => f.name), ['Job', 'Job/Notes', 'Private'])
  assert.equal(r.folders[0].extra, 1)
  assert.equal(r.folders[1].color, '#2BA5F7')
})

test('改名: 名前が似ているだけのフォルダは巻き込まない', () => {
  const r = renameFolder([...base, { key: 'd', name: 'Workshop' }], 'a', 'Job')
  assert.deepEqual(r.folders.map(f => f.name), ['Job', 'Job/Notes', 'Private', 'Workshop'])
})

test('改名: 空・見つからない・ほかと重なるものは断る', () => {
  assert.deepEqual(renameFolder(base, 'a', '  '), { ok: false, error: 'EMPTY_NAME' })
  assert.deepEqual(renameFolder(base, 'zz', 'x'), { ok: false, error: 'NOT_FOUND' })
  assert.deepEqual(renameFolder(base, 'c', 'Work'), { ok: false, error: 'PATH_CLASH' })
  // 子孫の付け替え先が既存と重なる場合も断る
  assert.deepEqual(renameFolder([...base, { key: 'e', name: 'Private/Notes' }], 'a', 'Private'), { ok: false, error: 'PATH_CLASH' })
})

test('改名: 同じ名前は変えず、表記の揺れだけ揃える', () => {
  const r = renameFolder([{ key: 'a', name: ' Work ' }], 'a', 'Work')
  assert.deepEqual(r.folders, [{ key: 'a', name: 'Work' }])
})

test('キーはデスクトップ版と同じ 20 桁の 16 進。色は 12 色', () => {
  assert.match(folderKey(), /^[0-9a-f]{20}$/)
  assert.equal(FOLDER_COLORS.length, 12)
})

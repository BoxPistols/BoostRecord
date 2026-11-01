// 添付の参照（:storage/ノートのキー/ファイル名）を読む
import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentPath, attachmentUrlKind } from '../src/data/attachments.ts'

test('デスクトップ版の書き方を、attachments/ からのパスにする', () => {
  assert.deepEqual(attachmentPath(':storage/bbff3c9c-c85d-420b-b3b2-dbb6e8f6c1c6/909cde7f.png'), ['bbff3c9c-c85d-420b-b3b2-dbb6e8f6c1c6', '909cde7f.png'])
  assert.deepEqual(attachmentPath('/:storage/k/a.jpg'), ['k', 'a.jpg'])
})

test('Windows の区切り（\\ と %5C）も読む', () => {
  assert.deepEqual(attachmentPath(':storage\\k\\a.png'), ['k', 'a.png'])
  assert.deepEqual(attachmentPath(':storage%5Ck%5Ca.png'), ['k', 'a.png'])
})

test('名前の符号化を戻し、? や # の後ろは落とす', () => {
  assert.deepEqual(attachmentPath(':storage/k/%E7%94%BB%E5%83%8F%20a.png'), ['k', '画像 a.png'])
  assert.deepEqual(attachmentPath(':storage/k/a.png?v=1#x'), ['k', 'a.png'])
})

test('添付でないもの、ストレージの外を指しうるものは読まない', () => {
  for (const ref of ['https://example.com/a.png', 'storage/k/a.png', ':storagex/a.png', ':storage', ':storage/', ':storage/../x.png',
    ':storage/k/..', ':storage/%2E%2E/x', ':storage/k%2Fa.png', ':storage/k/%E0%A4%A.png', ':storage%5C..%5Cx']) {
    assert.equal(attachmentPath(ref), null, ref)
  }
})

test('画像として出す URL は、拡張子で種類を決め直す（タブで開いてもこのサイトの中で文書として動かない）', () => {
  assert.deepEqual(attachmentUrlKind('a.PNG', 'image'), { kind: 'raster', type: 'image/png' })
  assert.deepEqual(attachmentUrlKind('写真.jpeg', 'image'), { kind: 'raster', type: 'image/jpeg' })
  assert.deepEqual(attachmentUrlKind('a.svg', 'image'), { kind: 'svg' })
  // 画像でないもの・拡張子の無いものは、開いても表示しない形にする
  for (const name of ['a.html', 'a.htm', 'a.xml', 'a.xhtml', 'a', 'a.svg.html', 'a.pdf', 'a.constructor', 'a.toString', 'a.valueOf']) {
    assert.deepEqual(attachmentUrlKind(name, 'image'), { kind: 'binary' }, name)
  }
})

test('リンクから保存させるものは、画像でも表示しない形にする', () => {
  for (const name of ['a.png', 'a.svg', 'a.html']) {
    assert.deepEqual(attachmentUrlKind(name, 'file'), { kind: 'binary' }, name)
  }
})

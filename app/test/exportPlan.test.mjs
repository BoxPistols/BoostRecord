import { test } from 'node:test'
import assert from 'node:assert/strict'
import { htmlDocument, notesInScope, planExport, zipName } from '../src/data/exportPlan.ts'

const note = (key, title, extra = {}) => ({
  key,
  type: 'MARKDOWN_NOTE',
  title,
  content: `# ${title}`,
  tags: [],
  storage: 's1',
  folder: 'f1',
  isStarred: false,
  isTrashed: false,
  createdAt: '',
  updatedAt: '',
  ...extra
})
const storages = [
  { key: 's1', name: 'Main', folders: [{ key: 'f1', name: 'Work' }, { key: 'f2', name: 'Home/Life' }] }
]

test('ゴミ箱とスニペットは、どの範囲にも入れない', () => {
  const notes = [note('a', 'A'), note('b', 'B', { isTrashed: true }), note('c', 'C', { type: 'SNIPPET_NOTE' })]
  assert.deepEqual(notesInScope(notes, { kind: 'all' }).map(n => n.key), ['a'])
  assert.deepEqual(notesInScope(notes, { kind: 'note', key: 'b' }), [])
})

test('フォルダとタグで絞る', () => {
  const notes = [note('a', 'A', { tags: ['x'] }), note('b', 'B', { folder: 'f2' }), note('c', 'C', { storage: 's2' })]
  assert.deepEqual(notesInScope(notes, { kind: 'folder', storage: 's1', folder: 'f1' }).map(n => n.key), ['a'])
  assert.deepEqual(notesInScope(notes, { kind: 'tag', tag: 'x' }).map(n => n.key), ['a'])
})

test('同じ題は番号を付けて分ける。大文字と小文字の違いだけでも分ける', () => {
  const notes = [note('a', 'Memo'), note('b', 'Memo'), note('c', 'memo'), note('d', 'Memo (1)')]
  const paths = planExport(notes, storages, { kind: 'folder', storage: 's1', folder: 'f1' }, 'md').map(i => i.path)
  assert.deepEqual(paths, ['Memo.md', 'Memo (1).md', 'memo (2).md', 'Memo (1) (1).md'])
  assert.equal(new Set(paths.map(p => p.toLowerCase())).size, paths.length)
})

test('すべてを書き出すときはフォルダ名のディレクトリに分ける（使えない文字は置き換える）', () => {
  const notes = [note('a', 'A'), note('b', 'B/C', { folder: 'f2' })]
  assert.deepEqual(
    planExport(notes, storages, { kind: 'all' }, 'txt').map(i => i.path),
    ['Work/A.txt', 'Home_Life/B_C.txt']
  )
})

test('ストレージが複数なら、その上にストレージ名のディレクトリを置く', () => {
  const two = [...storages, { key: 's2', name: 'Sub', folders: [{ key: 'f1', name: 'Work' }] }]
  const notes = [note('a', 'A'), note('b', 'A', { storage: 's2' })]
  assert.deepEqual(planExport(notes, two, { kind: 'all' }, 'md').map(i => i.path), ['Main/Work/A.md', 'Sub/Work/A.md'])
})

test('zip の名前は範囲と形式から付ける', () => {
  const day = new Date(2026, 9, 31)
  assert.equal(zipName({ kind: 'folder', storage: 's1', folder: 'f2' }, storages, 'html', day), 'Home_Life-html.zip')
  assert.equal(zipName({ kind: 'tag', tag: 'a:b' }, storages, 'md', day), 'a_b-md.zip')
  assert.equal(zipName({ kind: 'all' }, storages, 'txt', day), 'boostrecord-notes-20261031-txt.zip')
})

test('HTML は題をエスケープし、スクリプトを止める CSP を入れる', () => {
  const html = htmlDocument('<b>"x"</b>', 'p{} </style><script>', '<p>本文</p>')
  assert.match(html, /<title>&lt;b&gt;&quot;x&quot;&lt;\/b&gt;<\/title>/)
  assert.match(html, /default-src 'none'/)
  assert.doesNotMatch(html, /<\/style><script>/)
  assert.match(html, /<div class="preview">\n<p>本文<\/p>\n<\/div>/)
})

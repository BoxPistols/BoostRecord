// ブラウザ向けの CSON の読み書き。
//
// 正解役には cson-parser を使う。**テストの中でだけ**使い、製品のバンドルには
// 入れない（Node の vm に依存していてブラウザで動かないため）。
import test from 'node:test'
import assert from 'node:assert/strict'
import CSON from 'cson-parser'
import {
  parseNoteCson,
  stringifyNoteCson,
  updateNoteCson
} from '../src/data/cson.ts'

const noteFields = raw => ({
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
  type: raw.type,
  folder: raw.folder,
  title: raw.title,
  tags: raw.tags,
  isStarred: raw.isStarred,
  isTrashed: raw.isTrashed,
  content: raw.content
})

const samples = [
  {
    name: '素の markdown ノート',
    raw: {
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      type: 'MARKDOWN_NOTE',
      folder: 'f1',
      title: 'はじめに',
      tags: ['wip', 'a b'],
      isStarred: false,
      isTrashed: false,
      content: '# 見出し\n\n本文です。\n'
    }
  },
  {
    name: '引用符とバックスラッシュを含む',
    raw: {
      type: 'MARKDOWN_NOTE',
      title: "it's a \\ test",
      tags: [],
      isStarred: true,
      isTrashed: false,
      content: 'C:\\path\\to\n'
    }
  },
  {
    name: '空の本文',
    raw: {
      type: 'MARKDOWN_NOTE',
      title: '',
      tags: [],
      isStarred: false,
      isTrashed: false,
      content: ''
    }
  },
  {
    name: "本文に三重引用符を含む（閉じ記号と紛れる）",
    raw: {
      type: 'MARKDOWN_NOTE',
      title: 'tricky',
      tags: [],
      isStarred: false,
      isTrashed: false,
      content: "区切り ''' を含む\nタブ\tあり\n"
    }
  },
  {
    name: 'コードフェンスを含む本文',
    raw: {
      type: 'MARKDOWN_NOTE',
      title: 'code',
      tags: ['x'],
      isStarred: false,
      isTrashed: false,
      content: '```js\nconst x = 1\n```\n\n終わり\n'
    }
  }
]

for (const { name, raw } of samples) {
  test(`読み取りが cson-parser と一致する: ${name}`, () => {
    const text = CSON.stringify(raw, null, 2)
    assert.deepEqual(noteFields(parseNoteCson(text)), noteFields(raw))
  })

  test(`書き出しが cson-parser で読み戻せる: ${name}`, () => {
    const text = stringifyNoteCson(raw)
    assert.deepEqual(noteFields(CSON.parse(text)), noteFields(raw))
  })
}

test('SNIPPET_NOTE の解釈できない値は読み飛ばす', () => {
  const raw = {
    type: 'SNIPPET_NOTE',
    title: 'スニペット',
    tags: [],
    isStarred: false,
    isTrashed: false,
    description: 'せつめい',
    snippets: [
      { name: 'index.js', mode: 'JavaScript', content: 'const a = 1\n', linesHighlighted: [] }
    ],
    content: ''
  }
  const parsed = parseNoteCson(CSON.stringify(raw, null, 2))
  assert.equal(parsed.type, 'SNIPPET_NOTE')
  assert.equal(parsed.description, 'せつめい')
  // 読めない値はキーごと落とす。既定値で埋める側の責任にする
  assert.equal(parsed.snippets, undefined)
})

test('差し替えは指定したキー以外を1バイトも変えない', () => {
  const raw = {
    createdAt: '2026-01-01T00:00:00.000Z',
    type: 'SNIPPET_NOTE',
    title: '前の題名',
    tags: ['a'],
    isStarred: false,
    isTrashed: false,
    snippets: [
      { name: 'index.js', mode: 'JavaScript', content: 'const a = 1\n', linesHighlighted: [] }
    ],
    content: '前の本文\n'
  }
  const before = CSON.stringify(raw, null, 2)
  const after = updateNoteCson(before, {
    title: '新しい題名',
    content: '新しい本文\n複数行\n',
    updatedAt: '2026-02-02T00:00:00.000Z'
  })

  // cson-parser で読み戻せる
  const back = CSON.parse(after)
  assert.equal(back.title, '新しい題名')
  assert.equal(back.content, '新しい本文\n複数行\n')
  assert.equal(back.updatedAt, '2026-02-02T00:00:00.000Z')
  // 触っていない値は残る
  assert.deepEqual(back.snippets, raw.snippets)
  assert.equal(back.createdAt, raw.createdAt)
  assert.deepEqual(back.tags, ['a'])

  // snippets の行はテキストとしても元のまま
  const snippetBlock = s => s.slice(s.indexOf('snippets: ['), s.indexOf(']', s.indexOf('snippets: [')))
  assert.equal(snippetBlock(after), snippetBlock(before))
})

test('元に無いキーは末尾に足す', () => {
  const before = "title: 'a'\ntype: 'MARKDOWN_NOTE'"
  const after = updateNoteCson(before, { isStarred: true })
  assert.equal(CSON.parse(after).isStarred, true)
  assert.equal(CSON.parse(after).title, 'a')
})

test('配列の差し替えができる', () => {
  const before = CSON.stringify({ tags: ['a', 'b'], title: 'x' }, null, 2)
  assert.deepEqual(CSON.parse(updateNoteCson(before, { tags: [] })).tags, [])
  assert.deepEqual(
    CSON.parse(updateNoteCson(before, { tags: ['c'] })).tags,
    ['c']
  )
})

test('壊れたファイルでも投げずに読めた分を返す', () => {
  const parsed = parseNoteCson("title: 'ok'\nbroken: { unterminated\n")
  assert.equal(parsed.title, 'ok')
})

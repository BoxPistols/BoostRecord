/**
 * @fileoverview ノート一覧の検索で "..." の語句を並びのまま探す
 */
import searchFromNotes, { parseSearch } from 'browser/lib/search'

function note(key, content) {
  return { key, type: 'MARKDOWN_NOTE', content, tags: [] }
}

const notes = [
  note('a', '【業務内容】\n今回は、モックの作成です。\n\n・画面イメージ'),
  note('b', '今回は別の話。モックの作成は来月です。'),
  note('c', '無関係')
]

test('"..." は1つの語句、それ以外は空白で区切った語', () => {
  expect(parseSearch('"今回は、モック" 画面 #tag')).toEqual([
    { phrase: '今回は、モック' },
    { word: '画面' },
    { word: '#tag' }
  ])
})

test('語句は改行や空行を挟んでも並びのまま一致するノートだけを返す', () => {
  const found = searchFromNotes(
    notes,
    '"今回は、モックの作成です。 ・画面イメージ"'
  )
  expect(found.map(n => n.key)).toEqual(['a'])
})

test('語はこれまでどおり、すべてを含むノートを返す', () => {
  const found = searchFromNotes(notes, '今回は モックの作成')
  expect(found.map(n => n.key)).toEqual(['a', 'b'])
})

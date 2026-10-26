/**
 * @fileoverview browser/lib/editorFind（エディタの検索と置換）のテスト
 */
import {
  markMatches,
  clearMarks,
  selectMark,
  replaceMark,
  replaceAllMarks,
  indexAfter
} from 'browser/lib/editorFind'

// このテスト環境の jsdom には document.createRange が無い。CodeMirror は読み込み時に
// 計測の方法を決めるので、読み込む前に寸法 0 を返す代用品を入れる
if (!document.createRange) {
  const empty = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }
  document.createRange = () => ({
    setStart() {},
    setEnd() {},
    collapse() {},
    selectNodeContents() {},
    getBoundingClientRect: () => empty,
    getClientRects: () => ({ length: 0, item: () => null })
  })
}
const CodeMirror = require('codemirror')

function editor(value) {
  return CodeMirror(document.body, { value })
}

test('一致をすべて文書順にマークする', () => {
  const cm = editor('foo bar foo\nFOO')
  const marks = markMatches(cm, 'foo')
  expect(marks.length).toBe(3)
  expect(cm.indexFromPos(marks[2].find().from)).toBe(12)
  clearMarks(marks)
  expect(cm.getAllMarks().length).toBe(0)
})

test('空の検索語や CodeMirror が無いときは何もマークしない', () => {
  expect(markMatches(editor('abc'), '')).toEqual([])
  expect(markMatches(null, 'a')).toEqual([])
})

test('1件の置換は、マークの今の位置に当てる（検索後に前を編集しても別の場所を壊さない）', () => {
  const cm = editor('x foo y foo')
  const marks = markMatches(cm, 'foo')
  // 検索を開いたまま、先頭に文字を足す
  cm.replaceRange('前置き ', { line: 0, ch: 0 })
  const end = replaceMark(cm, marks[1], 'bar')
  expect(cm.getValue()).toBe('前置き x foo y bar')
  expect(end).toBe('前置き x foo y bar'.length)
})

test('中身を消されたマークは置換しない', () => {
  const cm = editor('a foo b')
  const marks = markMatches(cm, 'foo')
  cm.replaceRange('', { line: 0, ch: 2 }, { line: 0, ch: 5 })
  expect(replaceMark(cm, marks[0], 'bar')).toBe(-1)
  expect(cm.getValue()).toBe('a  b')
})

test('すべて置換は長さが変わっても各一致に正しく当たり、元に戻すは1回で済む', () => {
  const cm = editor('ab ab\nab')
  const marks = markMatches(cm, 'ab')
  expect(replaceAllMarks(cm, marks, 'xyz-')).toBe(3)
  expect(cm.getValue()).toBe('xyz- xyz-\nxyz-')
  cm.undo()
  expect(cm.getValue()).toBe('ab ab\nab')
})

test('置換後の文字列が検索語を含んでも、次の一致は置換した場所の後ろから選ぶ', () => {
  const cm = editor('a b a')
  const end = replaceMark(cm, markMatches(cm, 'a')[0], 'aa')
  const marks = markMatches(cm, 'a')
  // 'aa b a' の一致は 0, 1, 5。置換した 'aa' の後ろ（2 以降）の最初は 5
  expect(cm.indexFromPos(marks[indexAfter(cm, marks, end)].find().from)).toBe(5)
})

test('後ろに一致が無ければ先頭へ回り込み、0件なら -1', () => {
  const cm = editor('a b')
  const marks = markMatches(cm, 'a')
  expect(indexAfter(cm, marks, 3)).toBe(0)
  expect(indexAfter(cm, [], 0)).toBe(-1)
})

test('選択はマークの今の範囲に当たる', () => {
  const cm = editor('foo')
  const marks = markMatches(cm, 'foo')
  cm.replaceRange('12', { line: 0, ch: 0 })
  selectMark(cm, marks[0])
  expect(cm.getSelection()).toBe('foo')
})

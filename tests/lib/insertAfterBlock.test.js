/**
 * @fileoverview browser/lib/insertAfterBlockのテスト
 */
import {
  insertAfterBlock,
  removeAfterBlock,
  findImageLine,
  imageNeedle
} from 'browser/lib/insertAfterBlock'

// CodeMirrorのうち使うメソッドだけを持つ置き換え
function fakeEditor(value) {
  let lines = value.split('\n')
  return {
    lineCount: () => lines.length,
    getLine: n => lines[n],
    // CodeMirrorと同じく、fromからto（省略時はfrom）までを置き換える
    replaceRange(text, from, to) {
      const end = to || from
      const head = lines[from.line].slice(0, from.ch)
      const tail = lines[end.line].slice(end.ch)
      lines = lines
        .slice(0, from.line)
        .concat((head + text + tail).split('\n'), lines.slice(end.line + 1))
    },
    value: () => lines.join('\n')
  }
}

test('画像の段落の直後に空行を挟んで挿入する', () => {
  const cm = fakeEditor('# 見出し\n\n![a](a.png)\n![b](b.png)\n\n本文')
  expect(insertAfterBlock(cm, 2, '読み取った文字\n2行目')).toBe(true)
  expect(cm.value()).toBe(
    '# 見出し\n\n![a](a.png)\n![b](b.png)\n\n読み取った文字\n2行目\n\n本文'
  )
})

test('末尾の段落でも挿入できる', () => {
  const cm = fakeEditor('![a](a.png)')
  expect(insertAfterBlock(cm, 0, '文字')).toBe(true)
  expect(cm.value()).toBe('![a](a.png)\n\n文字')
})

test('空の文章や範囲外の行では何もしない', () => {
  const cm = fakeEditor('![a](a.png)')
  expect(insertAfterBlock(cm, 0, '  ')).toBe(false)
  expect(insertAfterBlock(cm, 5, '文字')).toBe(false)
  expect(insertAfterBlock(cm, NaN, '文字')).toBe(false)
  expect(cm.value()).toBe('![a](a.png)')
})

test('直後に同じ文章があれば挿入しない', () => {
  const cm = fakeEditor('![a](a.png)\n\n文字\n2行目\n\n本文')
  expect(insertAfterBlock(cm, 0, '文字\n2行目')).toBe('exists')
  expect(cm.value()).toBe('![a](a.png)\n\n文字\n2行目\n\n本文')
  // 続けて2回挿入しても1回分しか入らない
  const cm2 = fakeEditor('![a](a.png)')
  expect(insertAfterBlock(cm2, 0, '文字')).toBe(true)
  expect(insertAfterBlock(cm2, 0, '文字')).toBe('exists')
  expect(cm2.value()).toBe('![a](a.png)\n\n文字')
})

test('画像のsrcから原文で探す名前を取り出す', () => {
  // [src, 期待する名前]
  const testCases = [
    [
      'file:////Users/example/notes/attachments/abc/%E7%94%BB%E5%83%8F%201.png',
      '画像 1.png'
    ],
    ['https://example.com/img/photo.jpg?w=200#x', 'photo.jpg'],
    ['data:image/png;base64,AAAA', null],
    ['https://example.com/', null]
  ]
  testCases.forEach(([src, expected]) => {
    expect(imageNeedle(src)).toBe(expected)
  })
})

test('挿入位置は原文の画像の行で決め、古い行番号には引きずられない', () => {
  // プレビューのdata-lineが挿入前の2を指したまま、原文では画像bが4行下がっている
  const cm = fakeEditor(
    '![a](:storage/n/a.png)\n\n読み取った文字\n\n![b](:storage/n/b.png)\n\n本文'
  )
  expect(findImageLine(cm, 'b.png', 2)).toBe(4)
  // 同じ名前が複数あれば目安の行に近い方を選ぶ
  const dup = fakeEditor('![x](x.png)\n\n本文\n\n![x](x.png)')
  expect(findImageLine(dup, 'x.png', 3)).toBe(4)
  expect(findImageLine(dup, 'x.png', 0)).toBe(0)
  // 見つからなければ目安の行を使う
  expect(findImageLine(cm, 'none.png', 2)).toBe(2)
  expect(findImageLine(cm, null, 2)).toBe(2)
})

test('前に入れた文章が直後に残っていれば置き換える', () => {
  const cm = fakeEditor('![a](a.png)\n\n1回目の結果\n2行目\n\n本文')
  expect(insertAfterBlock(cm, 0, '2回目の結果', '1回目の結果\n2行目')).toBe(
    'replaced'
  )
  expect(cm.value()).toBe('![a](a.png)\n\n2回目の結果\n\n本文')
  // 前の文章が手で直されて残っていなければ、置き換えずに足す
  const edited = fakeEditor('![a](a.png)\n\n手で直した結果\n\n本文')
  expect(insertAfterBlock(edited, 0, '新しい結果', '1回目の結果')).toBe(true)
  expect(edited.value()).toBe(
    '![a](a.png)\n\n新しい結果\n\n手で直した結果\n\n本文'
  )
})

test('入れた文章だけを取り除き、変わっていれば何もしない', () => {
  const cm = fakeEditor('![a](a.png)\n\n本文')
  insertAfterBlock(cm, 0, '結果\n2行目')
  expect(removeAfterBlock(cm, 0, '結果\n2行目')).toBe(true)
  expect(cm.value()).toBe('![a](a.png)\n\n本文')
  expect(removeAfterBlock(cm, 0, '結果\n2行目')).toBe(false)
  expect(cm.value()).toBe('![a](a.png)\n\n本文')
})

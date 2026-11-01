// 続けて並べた画像の段落に印を付ける（デスクトップ版の imageRows と同じ判定）
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { markImageRows } from '../src/markdown/imageRows.ts'

const require = createRequire(import.meta.url)
const MarkdownIt = require('markdown-it')
const md = new MarkdownIt({ breaks: true })

function marked(src) {
  const doc = new Window().document
  doc.body.innerHTML = md.render(src)
  markImageRows(doc.body)
  return Array.from(doc.querySelectorAll('p')).map(p => p.classList.contains('image-row'))
}

test('続けた行の画像 2 つ以上は横に並べる', () => {
  assert.deepEqual(marked('![a](a.png)\n![b](b.png)'), [true])
  assert.deepEqual(marked('![a](a.png) ![b](b.png) ![c](c.png)'), [true])
})

test('中身が画像だけのリンクも数える', () => {
  assert.deepEqual(marked('[![a](a.png)](https://e.x)\n![b](b.png)'), [true])
})

test('画像 1 つ、文字の混ざった段落、文字のリンクは並べない', () => {
  assert.deepEqual(marked('![a](a.png)'), [false])
  assert.deepEqual(marked('![a](a.png)\n説明\n![b](b.png)'), [false])
  assert.deepEqual(marked('![a](a.png)\n[リンク](https://e.x)'), [false])
  // 空行で分けた画像は別の段落なので並べない
  assert.deepEqual(marked('![a](a.png)\n\n![b](b.png)'), [false, false])
})

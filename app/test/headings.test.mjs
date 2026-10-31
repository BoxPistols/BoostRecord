import { test } from 'node:test'
import assert from 'node:assert/strict'
import MarkdownIt from 'markdown-it'
import { extractHeadings, normalizeLevelRange, MIN_LEVEL, MAX_LEVEL } from '../src/markdown/headings.ts'
import { desktopSyntaxPlugin } from '../src/markdown/syntax.ts'

// プレビューと同じ解析結果から拾う。デスクトップ版の tests/lib/markdownHeadings.test.js の場合に、
// プレビューと食い違っていた場合（レビューの指摘）を足して見る
const md = new MarkdownIt().use(desktopSyntaxPlugin)
const headings = (src, opts) => extractHeadings(md.parse(src, {}), opts)
const texts = (src, opts) => headings(src, opts).map(h => h.text)

test('レベルと本文と行番号を返す（行は 0 始まり）', () => {
  assert.deepEqual(headings('# A\n\n## B', { maxLevel: 6 }), [
    { level: 1, text: 'A', line: 0 },
    { level: 2, text: 'B', line: 2 }
  ])
})

test('既定は H1〜H3。設定の範囲の外は落とす', () => {
  assert.deepEqual(headings('# a\n## b\n### c\n#### d').map(h => h.level), [1, 2, 3])
  assert.deepEqual(texts('# a\n## b\n### c', { minLevel: 2, maxLevel: 3 }), ['b', 'c'])
})

test('閉じの # は出さず、# の後ろに空白が無いものや空の見出しは拾わない', () => {
  assert.deepEqual(texts('## B ##'), ['B'])
  assert.deepEqual(texts('#NotAHeading'), [])
  assert.deepEqual(texts('#\n##   '), [])
})

test('コードの中の # は拾わない', () => {
  assert.deepEqual(texts('# real\n\n```sh\n# just a comment\n```\n\n## also real'), ['real', 'also real'])
  assert.deepEqual(texts('# real\n~~~\n# nope\n~~~'), ['real'])
  assert.deepEqual(texts('```\n~~~\n# still inside\n```\n# out'), ['out'])
  assert.deepEqual(texts('````\n```\n# still inside\n````\n# out'), ['out'])
  assert.deepEqual(texts('# a\n```\n# b'), ['a'])
  assert.deepEqual(headings('    # indented\n\t# tabbed\n\n# real'), [{ level: 1, text: 'real', line: 3 }])
})

test('プレビューで見出しになるものは目次にも出る（字下げ 3 つまで・引用の中・下線の見出し）', () => {
  assert.deepEqual(texts('   # Indented'), ['Indented'])
  assert.deepEqual(texts('> # Quoted'), ['Quoted'])
  assert.deepEqual(texts('Title\n=====\n\nSub\n---'), ['Title', 'Sub'])
  assert.deepEqual(texts('# ![概要](logo.png)'), ['概要'])
})

test('字下げ 4 つのフェンスや、閉じに文字が続く行でフェンスを取り違えない', () => {
  assert.deepEqual(texts('    ```\n\n# Real'), ['Real'])
  assert.deepEqual(texts('```\n```js\n# in code\n```\n# out'), ['out'])
})

test('改行が CRLF でも front matter の中の # は拾わない', () => {
  assert.deepEqual(headings('---\r\n# comment\r\n---\r\n# Real'), [{ level: 1, text: 'Real', line: 3 }])
  assert.deepEqual(headings('---\n# yaml comment\ntitle: x\n---\n# Real'), [{ level: 1, text: 'Real', line: 4 }])
})

test('normalizeLevelRange', () => {
  assert.deepEqual(normalizeLevelRange(undefined, undefined), { min: 1, max: 3 })
  assert.deepEqual(normalizeLevelRange(0, 99), { min: MIN_LEVEL, max: MAX_LEVEL })
  assert.deepEqual(normalizeLevelRange(4, 2), { min: 2, max: 4 })
  assert.deepEqual(normalizeLevelRange('2', '4'), { min: 2, max: 4 })
})

test('目次の行番号は、プレビューの見出しの data-line と同じ', () => {
  const src = '---\ntitle: x\n---\n# A\n\ntext\n\n```\n# no\n```\n\n## B\n\n> ### C\n\nD\n---'
  const lines = [...md.render(src).matchAll(/<h\d[^>]*data-line="(\d+)"/g)].map(m => Number(m[1]))
  assert.deepEqual(lines, headings(src, { maxLevel: 6 }).map(h => h.line))
})

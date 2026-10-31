import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractHeadings, normalizeLevelRange, MIN_LEVEL, MAX_LEVEL } from '../src/markdown/headings.ts'
import MarkdownIt from 'markdown-it'
import { desktopSyntaxPlugin } from '../src/markdown/syntax.ts'

// デスクトップ版の tests/lib/markdownHeadings.test.js と同じ場合を見る
const texts = (md, opts) => extractHeadings(md, opts).map(h => h.text)

test('レベルと本文と行番号を返す（行は 0 始まり）', () => {
  assert.deepEqual(extractHeadings('# A\n\n## B', { maxLevel: 6 }), [
    { level: 1, text: 'A', line: 0 },
    { level: 2, text: 'B', line: 2 }
  ])
})

test('既定は H1〜H3。設定の範囲の外は落とす', () => {
  assert.deepEqual(extractHeadings('# a\n## b\n### c\n#### d').map(h => h.level), [1, 2, 3])
  assert.deepEqual(texts('# a\n## b\n### c', { minLevel: 2, maxLevel: 3 }), ['b', 'c'])
})

test('閉じの # は出さず、# の後ろに空白が無いものや空の見出しは拾わない', () => {
  assert.equal(extractHeadings('## B ##')[0].text, 'B')
  assert.deepEqual(extractHeadings('#NotAHeading'), [])
  assert.deepEqual(extractHeadings('#\n##   '), [])
})

test('コードの中の # は拾わない', () => {
  assert.deepEqual(texts('# real\n\n```sh\n# just a comment\n```\n\n## also real'), ['real', 'also real'])
  assert.deepEqual(texts('# real\n~~~\n# nope\n~~~'), ['real'])
  assert.deepEqual(texts('```\n~~~\n# still inside\n```\n# out'), ['out'])
  assert.deepEqual(texts('````\n```\n# still inside\n````\n# out'), ['out'])
  assert.deepEqual(texts('# a\n```\n# b'), ['a'])
  assert.deepEqual(extractHeadings('    # indented\n\t# tabbed\n# real'), [{ level: 1, text: 'real', line: 2 }])
})

test('front matter の中の # は拾わない', () => {
  assert.deepEqual(extractHeadings('---\n# yaml comment\ntitle: x\n---\n# Real'), [{ level: 1, text: 'Real', line: 4 }])
})

test('normalizeLevelRange', () => {
  assert.deepEqual(normalizeLevelRange(undefined, undefined), { min: 1, max: 3 })
  assert.deepEqual(normalizeLevelRange(0, 99), { min: MIN_LEVEL, max: MAX_LEVEL })
  assert.deepEqual(normalizeLevelRange(4, 2), { min: 2, max: 4 })
  assert.deepEqual(normalizeLevelRange('2', '4'), { min: 2, max: 4 })
})

test('目次の行番号は、プレビューの見出しの data-line と同じ', () => {
  const md = '---\ntitle: x\n---\n# A\n\ntext\n\n```\n# no\n```\n\n## B\n\n- item\n\n### C'
  const html = new MarkdownIt().use(desktopSyntaxPlugin).render(md)
  const lines = [...html.matchAll(/<h\d[^>]*data-line="(\d+)"/g)].map(m => Number(m[1]))
  assert.deepEqual(lines, extractHeadings(md).map(h => h.line))
})

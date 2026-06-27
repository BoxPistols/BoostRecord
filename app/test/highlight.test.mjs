import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { highlightCode } from '../src/markdown/highlight.ts'

const require = createRequire(import.meta.url)
const window = new Window()
const MarkdownIt = require('markdown-it')
const DOMPurify = require('dompurify')(window)

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight: highlightCode
})

test('highlightCode marks up a known language', () => {
  const out = highlightCode('const x = 1', 'js')
  assert.match(out, /class="hljs/)
  assert.match(out, /hljs-keyword/) // `const`
})

test('highlightCode returns empty for an unknown language', () => {
  assert.equal(highlightCode('foo bar', 'no-such-lang'), '')
})

test('fenced code block renders hljs spans through markdown-it', () => {
  const html = md.render('```js\nconst x = 1\n```')
  assert.match(html, /class="hljs/)
  assert.match(html, /hljs-keyword/)
})

test('unknown-language fence still renders a code block (no throw)', () => {
  const html = md.render('```no-such-lang\nfoo\n```')
  assert.match(html, /<code/)
})

test('hljs markup survives DOMPurify sanitization', () => {
  const clean = DOMPurify.sanitize(md.render('```js\nconst x = 1\n```'))
  assert.match(clean, /class="hljs/)
  assert.match(clean, /hljs-keyword/)
})

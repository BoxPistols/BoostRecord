import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'

const require = createRequire(import.meta.url)

// Provide a DOM so DOMPurify works under `node --test` (no browser here).
const window = new Window()
const MarkdownIt = require('markdown-it')
const katexPlugin = require('@vscode/markdown-it-katex').default
const DOMPurify = require('dompurify')(window)

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
md.use(katexPlugin, { throwOnError: false, output: 'html' })

test('inline math renders KaTeX markup', () => {
  assert.match(md.render('Euler: $e^{i\\pi}+1=0$'), /class="katex/)
})

test('block math renders KaTeX markup', () => {
  assert.match(md.render('$$\\int_0^1 x^2\\,dx$$'), /class="katex/)
})

test('KaTeX markup survives DOMPurify sanitization', () => {
  const clean = DOMPurify.sanitize(md.render('$x^2$'))
  assert.match(clean, /class="katex/) // not stripped by the sanitizer
  assert.match(clean, /x/) // the variable is still present
})

test('plain markdown still renders (no regression)', () => {
  const html = md.render('# Hi\n\n**bold**')
  assert.match(html, /<h1>/)
  assert.match(html, /<strong>bold<\/strong>/)
})

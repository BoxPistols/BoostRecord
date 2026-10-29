import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { taskListPlugin, toggleTaskLine, todoStatus } from '../src/markdown/taskList.ts'

const require = createRequire(import.meta.url)
const window = new Window()
const MarkdownIt = require('markdown-it')
const DOMPurify = require('dompurify')(window)

const md = new MarkdownIt({ html: false, linkify: true, breaks: true }).use(taskListPlugin)

test('[ ] と [x] のリスト項目がチェックボックスになり、元の行番号を持つ', () => {
  const html = md.render('# t\n\n- [ ] 買い物\n- [x] 掃除\n- 普通の項目')
  assert.match(html, /<li class="task-item"><label class="task-label"><input type="checkbox" class="task-checkbox" data-line="2"><span class="task-check"><\/span>買い物<\/label><\/li>/)
  assert.match(html, /<li class="task-item checked"><label[^>]*><input[^>]*data-line="3" checked><span class="task-check"><\/span>掃除/)
  assert.match(html, /<li>普通の項目<\/li>/)
  assert.doesNotMatch(html, /\[ \]|\[x\]/)
})

test('リストの外や、本文のない [ ] はチェックボックスにしない', () => {
  assert.doesNotMatch(md.render('[ ] 段落'), /checkbox/)
  assert.doesNotMatch(md.render('- [ ]'), /checkbox/)
  assert.doesNotMatch(md.render('1. [ ] 番号付き'), /checkbox/)
  assert.doesNotMatch(md.render('```\n- [ ] code\n```'), /checkbox/)
})

test('チェックボックスは DOMPurify を通っても残り、本文の HTML は無効のまま', () => {
  const clean = DOMPurify.sanitize(md.render('- [x] <img src=x onerror=alert(1)>'))
  assert.match(clean, /<input[^>]*type="checkbox"[^>]*checked/)
  assert.match(clean, /data-line="0"/)
  assert.doesNotMatch(clean, /<img/)
})

test('引用の中のリストも元の行番号を指す', () => {
  assert.match(md.render('a\n\n> - [ ] 引用'), /data-line="2"/)
})

test('toggleTaskLine は指定行のチェックだけを反転する', () => {
  const src = '- [ ] a\n- [x] b\n> * [X] c\n普通'
  assert.equal(toggleTaskLine(src, 0), '- [x] a\n- [x] b\n> * [X] c\n普通')
  assert.equal(toggleTaskLine(src, 1), '- [ ] a\n- [ ] b\n> * [X] c\n普通')
  assert.equal(toggleTaskLine(src, 2), '- [ ] a\n- [x] b\n> * [ ] c\n普通')
  assert.equal(toggleTaskLine(src, 3), src)
  assert.equal(toggleTaskLine(src, 99), src)
})

test('toggleTaskLine は可変のリスト区切りと継続行を切り替える', () => {
  const src = '-  [ ] a\n-\n  [x] b\n> -\n>   [ ] c'
  assert.equal(toggleTaskLine(src, 0), '-  [x] a\n-\n  [x] b\n> -\n>   [ ] c')
  assert.equal(toggleTaskLine(src, 2), '-  [ ] a\n-\n  [ ] b\n> -\n>   [ ] c')
  assert.equal(toggleTaskLine(src, 4), '-  [ ] a\n-\n  [x] b\n> -\n>   [x] c')
})

test('todoStatus は件数と完了数を数え、コードブロックの中は数えない', () => {
  const src = '- [ ] a\n  - [x] b\n> + [X] c\n````\n```\n- [ ] x\n````\n~~~\n- [ ] y\n~~~\n    - [ ] z\n- [ ]\n1. [ ] d'
  assert.deepEqual(todoStatus(src), { total: 3, completed: 2 })
  assert.deepEqual(todoStatus('なし'), { total: 0, completed: 0 })
})

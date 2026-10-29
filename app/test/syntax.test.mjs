import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { desktopSyntaxPlugin, slugify } from '../src/markdown/syntax.ts'

const require = createRequire(import.meta.url)
const window = new Window()
const MarkdownIt = require('markdown-it')
const DOMPurify = require('dompurify')(window)

// Preview と同じ設定。DOMPurify を通した後の形で確かめる
const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true }).use(desktopSyntaxPlugin)
// happy-dom の DOMPurify は先頭の要素の外枠を落とす（実ブラウザでは落ちない）。外側に 1 枚かぶせて避ける
const render = src => DOMPurify.sanitize(`<div>${md.render(src)}</div>`)

test('絵文字・上付き・下付き・キー・画像サイズ', () => {
  const html = render(':smile: H~2~O x^2^ [[Ctrl]]+[[C]] ![a](x.png =100x50)')
  assert.match(html, /😄/)
  assert.match(html, /H<sub>2<\/sub>O/)
  assert.match(html, /x<sup>2<\/sup>/)
  assert.match(html, /<kbd>Ctrl<\/kbd>\+<kbd>C<\/kbd>/)
  assert.match(html, /<img src="x.png" alt="a" width="100" height="50">/)
})

test('画像の大きさ指定は幅だけ・題つきも読み、javascript: は通さない', () => {
  assert.match(render('![a](x.png =100x)'), /<img src="x.png" alt="a" width="100">/)
  assert.match(render('![a](x.png "題" =x40)'), /<img src="x.png" alt="a" title="題" height="40">/)
  assert.doesNotMatch(render('![a](javascript:alert(1) =10x10)'), /<img/)
})

test('顔文字は置き換えない（デスクトップ版と同じ）', () => {
  assert.match(render('笑 :)'), /:\)/)
})

test('脚注・略語・定義リスト', () => {
  const html = render('*[HTML]: Hyper Text\nHTML です[^1]\n\n[^1]: 補足\n\n用語\n: 説明')
  assert.match(html, /<abbr title="Hyper Text">HTML<\/abbr>/)
  assert.match(html, /<a href="#fn1" id="fnref1">/)
  assert.match(html, /<li id="fn1" class="footnote-item">/)
  assert.match(html, /<dl>\s*<dt>用語<\/dt>\s*<dd>説明<\/dd>/)
})

test('注意書きの枠（admonition）', () => {
  const html = render('!!! caution 気をつける\n本文\n!!!')
  assert.match(html, /<div class="admonition caution">\s*<p class="admonition-title">気をつける<\/p>\s*<p>本文<\/p>/)
})

test('セルを結合できる表', () => {
  assert.match(render('|a|b|\n|-|-|\n|c||'), /<td colspan="2">c<\/td>/)
})

test('front matter は表示しない', () => {
  const html = render('---\ntitle: x\ntags: [a]\n---\n本文')
  assert.doesNotMatch(html, /title: x/)
  assert.match(html, /<p>本文<\/p>/)
})

test('見出しに id が付き、[TOC] が見出しの一覧になる', () => {
  const html = render('[TOC]\n\n# はじめに\n\n## 準備 する\n\n## 準備 する\n\n# 終わり')
  assert.match(html, /<h1 id="%E3%81%AF%E3%81%98%E3%82%81%E3%81%AB">/)
  assert.match(html, new RegExp(`<h2 id="${slugify('準備 する')}">`))
  assert.match(html, new RegExp(`<h2 id="${slugify('準備 する')}-1">`))
  assert.match(html, /<nav class="toc"><ul><li><a href="#[^"]+">はじめに<\/a><ul><li><a[^>]*>準備 する<\/a><\/li><li><a[^>]*>準備 する<\/a><\/li><\/ul><\/li><li><a[^>]*>終わり<\/a><\/li><\/ul><\/nav>/)
  assert.doesNotMatch(html, /\[TOC\]/)
})

test('見出しの文字に HTML を書いても目次やidに入らない', () => {
  const html = render('[TOC]\n\n# <img src=x onerror=alert(1)> "q"')
  assert.doesNotMatch(html, /<img/)
  assert.doesNotMatch(html, /<[^>]*\sonerror=/)
})

test('見出しの絵文字も目次に入り、生成済みの id と重ならない', () => {
  const html = render('[TOC]\n\n# :smile: 笑顔\n\n# foo\n\n# foo-1\n\n# foo')
  assert.match(html, /<a href="#[^"]+">😄 笑顔<\/a>/)
  const ids = [...html.matchAll(/<h1 id="([^"]+)"/g)].map(m => m[1])
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(ids.slice(1), ['foo', 'foo-1', 'foo-2'])
})

test('段落の途中の [TOC] はそのまま', () => {
  assert.match(render('ここに [TOC] と書く'), /\[TOC\]/)
})

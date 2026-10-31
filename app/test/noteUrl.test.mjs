import { test } from 'node:test'
import assert from 'node:assert/strict'
import MarkdownIt from 'markdown-it'
import { hashForNote, noteKeyFromHash, noteKeyFromLegacyLink, noteKeyFromLink, noteLink } from '../src/noteUrl.ts'

const hex20 = '1c211eb7dcb463de6490'
const uuid = '7dd23275-f2b4-49cb-9e93-3454daf1af9c'
const web = 'a'.repeat(32)

test('# からキーを取り、作った # と行き来できる', () => {
  for (const key of [hex20, uuid, web]) assert.equal(noteKeyFromHash(hashForNote(key)), key)
})

test('ノートを指さない # は null', () => {
  for (const h of ['', '#', '#/note/', '#/note/short', `#/note/${web}/x`, `#/note/../${hex20}`, `#fn1`]) {
    assert.equal(noteKeyFromHash(h), null, h)
  }
})

test(':note: のリンクはデスクトップ版と同じ形だけを拾う', () => {
  assert.equal(noteKeyFromLink(`:note:${uuid}`), uuid)
  assert.equal(noteKeyFromLink(`:note:${hex20}`), hex20)
  assert.equal(noteKeyFromLink(`:note:${hex20}x?y`), null)
  assert.equal(noteKeyFromLink('https://example.com'), null)
})

test('コピーするリンクは、題に ] があってもそのノートへのリンクとして読める', () => {
  const md = new MarkdownIt()
  const link = noteLink({ key: web, title: 'a ] b [c] \\' })
  const html = md.renderInline(link)
  assert.match(html, new RegExp(`href=":note:${web}"`))
  assert.match(html, />a \] b \[c\] \\<\/a>/)
})

test('旧 Boostnote の ストレージキー-ノートキー からノートのキーを取る（# の有無どちらも）', () => {
  assert.equal(noteKeyFromLegacyLink('877f99c3268608328037-1c211eb7dcb463de6490'), '1c211eb7dcb463de6490')
  assert.equal(noteKeyFromLegacyLink('#877f99c3268608328037-1c211eb7dcb463de6490'), '1c211eb7dcb463de6490')
  assert.equal(noteKeyFromLegacyLink('https://a.example/877f99c3268608328037-1c211eb7dcb463de6490'), null)
  assert.equal(noteKeyFromLegacyLink('#877f99c3268608328037-1c211eb7'), null)
  assert.equal(noteKeyFromLegacyLink('#fn1'), null)
})

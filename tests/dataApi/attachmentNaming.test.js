'use strict'

// 貼り付け画像の自動命名（#98）。名前の衝突判定は実ファイルの有無で行うので
// fs をモックしない。
const fs = require('fs')
const os = require('os')
const path = require('path')

const attachmentManagement = require('browser/main/lib/dataApi/attachmentManagement')

let dir

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-names-'))
})

afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (e) {
    /* best-effort */
  }
})

it('日時ベースの読める名前になる', () => {
  expect(attachmentManagement.buildPastedAttachmentName(dir, '.png')).toMatch(
    /^img-\d{8}-\d+\.png$/
  )
})

it('参照パーサが解釈できる文字だけを使う', () => {
  // ここを外れるとノート本文の参照が解決できず、添付が orphan 扱いになる
  expect(attachmentManagement.buildPastedAttachmentName(dir, '.png')).toMatch(
    /^[\w.-]+$/
  )
})

it('拡張子を引き継ぐ', () => {
  expect(attachmentManagement.buildPastedAttachmentName(dir, '.jpg')).toMatch(
    /\.jpg$/
  )
})

it('同じ日に複数貼ると連番が進む', () => {
  const first = attachmentManagement.buildPastedAttachmentName(dir, '.png')
  expect(first).toMatch(/-1\.png$/)
  fs.writeFileSync(path.join(dir, first), 'x')

  const second = attachmentManagement.buildPastedAttachmentName(dir, '.png')
  expect(second).toMatch(/-2\.png$/)
  fs.writeFileSync(path.join(dir, second), 'x')

  const third = attachmentManagement.buildPastedAttachmentName(dir, '.png')
  expect(third).toMatch(/-3\.png$/)
})

it('連番は既存の最大値から続き、途中が消えても番号を再利用しない', () => {
  const first = attachmentManagement.buildPastedAttachmentName(dir, '.png')
  fs.writeFileSync(path.join(dir, first), 'x')
  const second = attachmentManagement.buildPastedAttachmentName(dir, '.png')
  fs.writeFileSync(path.join(dir, second), 'x')
  // 1 番を消しても 1 に戻さない（本文の参照が残っている可能性があるため）
  fs.unlinkSync(path.join(dir, first))

  expect(attachmentManagement.buildPastedAttachmentName(dir, '.png')).toMatch(
    /-3\.png$/
  )
})

it('拡張子が違っても同じ日の連番を共有する', () => {
  const first = attachmentManagement.buildPastedAttachmentName(dir, '.png')
  fs.writeFileSync(path.join(dir, first), 'x')
  expect(attachmentManagement.buildPastedAttachmentName(dir, '.jpg')).toMatch(
    /-2\.jpg$/
  )
})

it('連番も参照パーサが解釈できる文字に収まる', () => {
  const first = attachmentManagement.buildPastedAttachmentName(dir, '.png')
  fs.writeFileSync(path.join(dir, first), 'x')
  expect(attachmentManagement.buildPastedAttachmentName(dir, '.png')).toMatch(
    /^[\w.-]+$/
  )
})

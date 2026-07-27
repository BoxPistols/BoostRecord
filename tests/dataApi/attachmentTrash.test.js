'use strict'

// 実ファイルシステム（tmp）で検証する。ゴミ箱は「本当に移動したか」「本当に
// 消えていないか」が要件そのものなので fs をモックしない。
const fs = require('fs')
const os = require('os')
const path = require('path')

const attachmentTrash = require('browser/main/lib/dataApi/attachmentTrash')

const DAY_MS = 24 * 60 * 60 * 1000

let root

function makeStorage() {
  const storagePath = fs.mkdtempSync(path.join(root, 'storage-'))
  return { key: 'storageKey', name: 'Storage', path: storagePath }
}

function writeAttachment(storage, noteKey, fileName, content) {
  const dir = path.join(storage.path, 'attachments', noteKey)
  fs.mkdirSync(dir, { recursive: true })
  const absPath = path.join(dir, fileName)
  fs.writeFileSync(absPath, content || 'x')
  return absPath
}

function trashDir(storage) {
  return path.join(storage.path, attachmentTrash.TRASH_FOLDER)
}

// sidecar の deletedAt を過去に書き換えて経過日数を再現する
function ageEntry(storage, daysAgo) {
  const names = fs
    .readdirSync(trashDir(storage))
    .filter(n => n.endsWith(attachmentTrash.META_SUFFIX))
  names.forEach(name => {
    const metaPath = path.join(trashDir(storage), name)
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    meta.deletedAt = new Date(Date.now() - daysAgo * DAY_MS).toISOString()
    fs.writeFileSync(metaPath, JSON.stringify(meta))
  })
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-trash-'))
})

afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true })
  } catch (e) {
    /* best-effort */
  }
})

it('ゴミ箱へ移動すると元の場所から消え、実体と sidecar が残る', async () => {
  const storage = makeStorage()
  const absPath = writeAttachment(storage, 'noteA', 'image-1.png', 'payload')

  const result = await attachmentTrash.trashAttachments([absPath])

  expect(result.trashed).toEqual([absPath])
  expect(result.failed).toEqual([])
  expect(fs.existsSync(absPath)).toBe(false)

  const names = fs.readdirSync(trashDir(storage))
  const files = names.filter(n => !n.endsWith(attachmentTrash.META_SUFFIX))
  expect(files).toHaveLength(1)
  expect(names).toHaveLength(2)
  // 中身が保全されていること（移動であって作り直しでない）
  expect(fs.readFileSync(path.join(trashDir(storage), files[0]), 'utf8')).toBe(
    'payload'
  )
})

it('ゴミ箱は attachments/ の外に作られる（未使用として再列挙されないため）', async () => {
  const storage = makeStorage()
  const absPath = writeAttachment(storage, 'noteA', 'image-1.png')

  await attachmentTrash.trashAttachments([absPath])

  expect(fs.existsSync(trashDir(storage))).toBe(true)
  const attachmentsEntries = fs.readdirSync(
    path.join(storage.path, 'attachments')
  )
  expect(attachmentsEntries).not.toContain(attachmentTrash.TRASH_FOLDER)
})

it('添付フォルダ配下でないパスは移動せず failed になる', async () => {
  const storage = makeStorage()
  const strayPath = path.join(storage.path, 'notes', 'note.cson')
  fs.mkdirSync(path.dirname(strayPath), { recursive: true })
  fs.writeFileSync(strayPath, 'keep me')

  const result = await attachmentTrash.trashAttachments([strayPath])

  expect(result.trashed).toEqual([])
  expect(result.failed).toHaveLength(1)
  expect(fs.existsSync(strayPath)).toBe(true)
})

it('同名ファイルを複数ノートから捨てても衝突しない', async () => {
  const storage = makeStorage()
  const a = writeAttachment(storage, 'noteA', 'image.png', 'A')
  const b = writeAttachment(storage, 'noteB', 'image.png', 'B')

  await attachmentTrash.trashAttachments([a, b])

  const entries = await attachmentTrash.listTrashedAttachments([storage])
  expect(entries).toHaveLength(2)
  expect(entries.map(e => e.noteKey).sort()).toEqual(['noteA', 'noteB'])
})

it('列挙は残り日数と復元可否を返す', async () => {
  const storage = makeStorage()
  const absPath = writeAttachment(storage, 'noteA', 'image-1.png')
  await attachmentTrash.trashAttachments([absPath])

  const entries = await attachmentTrash.listTrashedAttachments([storage])

  expect(entries).toHaveLength(1)
  expect(entries[0].fileName).toBe('image-1.png')
  expect(entries[0].noteKey).toBe('noteA')
  expect(entries[0].restorable).toBe(true)
  expect(entries[0].expired).toBe(false)
  expect(entries[0].daysLeft).toBe(attachmentTrash.TRASH_RETENTION_DAYS)
})

it('復元すると元のノートの添付フォルダに戻る', async () => {
  const storage = makeStorage()
  const absPath = writeAttachment(storage, 'noteA', 'image-1.png', 'payload')
  await attachmentTrash.trashAttachments([absPath])
  const entries = await attachmentTrash.listTrashedAttachments([storage])

  const result = await attachmentTrash.restoreTrashedAttachments(entries)

  expect(result.failed).toEqual([])
  expect(result.restored).toHaveLength(1)
  expect(result.restored[0].renamed).toBe(false)
  expect(fs.existsSync(absPath)).toBe(true)
  expect(fs.readFileSync(absPath, 'utf8')).toBe('payload')
  // ゴミ箱側は実体も sidecar も残らない
  expect(fs.readdirSync(trashDir(storage))).toEqual([])
})

it('復元先が埋まっていても上書きせず別名で復元する', async () => {
  const storage = makeStorage()
  const absPath = writeAttachment(storage, 'noteA', 'image-1.png', 'old')
  await attachmentTrash.trashAttachments([absPath])
  // 同じ自動生成名で貼り直した状態を再現
  writeAttachment(storage, 'noteA', 'image-1.png', 'new')
  const entries = await attachmentTrash.listTrashedAttachments([storage])

  const result = await attachmentTrash.restoreTrashedAttachments(entries)

  expect(result.restored[0].renamed).toBe(true)
  expect(fs.readFileSync(absPath, 'utf8')).toBe('new')
  expect(fs.readFileSync(result.restored[0].restoredPath, 'utf8')).toBe('old')
  // 復元名も参照パーサが読める文字だけで構成されること
  expect(path.basename(result.restored[0].restoredPath)).toMatch(/^[\w.-]+$/)
})

it('30日未満は自動purgeで消えない', async () => {
  const storage = makeStorage()
  const absPath = writeAttachment(storage, 'noteA', 'image-1.png')
  await attachmentTrash.trashAttachments([absPath])
  ageEntry(storage, 29)

  const result = await attachmentTrash.purgeExpiredTrash([storage])

  expect(result.deleted).toEqual([])
  expect(await attachmentTrash.listTrashedAttachments([storage])).toHaveLength(
    1
  )
})

it('30日を過ぎたものは自動purgeで完全削除される', async () => {
  const storage = makeStorage()
  const absPath = writeAttachment(storage, 'noteA', 'image-1.png')
  await attachmentTrash.trashAttachments([absPath])
  ageEntry(storage, 31)

  const result = await attachmentTrash.purgeExpiredTrash([storage])

  expect(result.deleted).toHaveLength(1)
  expect(result.failed).toEqual([])
  expect(fs.readdirSync(trashDir(storage))).toEqual([])
})

it('sidecar が壊れているエントリは自動purgeで消さない（年齢不明≠期限切れ）', async () => {
  const storage = makeStorage()
  const absPath = writeAttachment(storage, 'noteA', 'image-1.png')
  await attachmentTrash.trashAttachments([absPath])
  const metaName = fs
    .readdirSync(trashDir(storage))
    .find(n => n.endsWith(attachmentTrash.META_SUFFIX))
  fs.writeFileSync(path.join(trashDir(storage), metaName), 'not json')

  const result = await attachmentTrash.purgeExpiredTrash([storage])

  expect(result.deleted).toEqual([])
  const entries = await attachmentTrash.listTrashedAttachments([storage])
  expect(entries).toHaveLength(1)
  expect(entries[0].daysLeft).toBe(null)
  expect(entries[0].restorable).toBe(false)
})

it('明示的な完全削除は実体と sidecar の両方を消す', async () => {
  const storage = makeStorage()
  const absPath = writeAttachment(storage, 'noteA', 'image-1.png')
  await attachmentTrash.trashAttachments([absPath])
  const entries = await attachmentTrash.listTrashedAttachments([storage])

  const result = await attachmentTrash.purgeTrashedAttachments(entries)

  expect(result.deleted).toHaveLength(1)
  expect(result.failed).toEqual([])
  expect(fs.readdirSync(trashDir(storage))).toEqual([])
})

it('ゴミ箱が未作成のストレージでも列挙は空配列を返す', async () => {
  const storage = makeStorage()
  expect(await attachmentTrash.listTrashedAttachments([storage])).toEqual([])
  expect(await attachmentTrash.listTrashedAttachments(null)).toEqual([])
})

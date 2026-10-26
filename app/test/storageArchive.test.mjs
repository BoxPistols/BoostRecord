// zip の読み書きと、OPFS のストレージの出し入れ。ブラウザ無しで回すため、
// 使っているハンドルの API だけを持つ偽物を立てる
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import CSON from 'cson-parser'
import { createZip, readZip, crc32 } from '../src/data/zip.ts'
import {
  exportStorageZip,
  parseStorageZip,
  replaceStorage
} from '../src/data/storageArchive.ts'
import { createOpfsRepository, openOpfsStorage } from '../src/data/opfs.ts'

const enc = new TextEncoder()
const dec = new TextDecoder()

/* ── 偽のディレクトリハンドル（removeEntry の recursive を持つ） ─────── */

function makeFile(text = '') {
  return {
    kind: 'file',
    text,
    lastModified: 1000,
    async getFile() {
      return { text: async () => this.text, lastModified: this.lastModified }
    },
    async createWritable() {
      const self = this
      let buf = ''
      return {
        async write(chunk) {
          buf += chunk
        },
        async close() {
          self.text = buf
          self.lastModified += 1000
        }
      }
    }
  }
}

function makeDir(name) {
  return {
    kind: 'directory',
    name,
    files: {},
    dirs: {},
    async getFileHandle(n, opts) {
      if (!this.files[n]) {
        if (!opts || !opts.create) throw new DOMException(n, 'NotFoundError')
        this.files[n] = makeFile()
      }
      return this.files[n]
    },
    async getDirectoryHandle(n, opts) {
      if (!this.dirs[n]) {
        if (!opts || !opts.create) throw new DOMException(n, 'NotFoundError')
        this.dirs[n] = makeDir(n)
      }
      return this.dirs[n]
    },
    async removeEntry(n, opts) {
      if (this.files[n]) delete this.files[n]
      else if (this.dirs[n] && opts && opts.recursive) delete this.dirs[n]
      else throw new DOMException(n, 'NotFoundError')
    },
    async *entries() {
      for (const [n, f] of Object.entries(this.files)) yield [n, f]
      for (const [n, d] of Object.entries(this.dirs)) yield [n, d]
    },
    async queryPermission() {
      return 'granted'
    },
    async requestPermission() {
      return 'granted'
    }
  }
}

/* ── zip ──────────────────────────────────────────────────────────── */

test('CRC32 は既知の値と一致する', () => {
  assert.equal(crc32(enc.encode('123456789')), 0xcbf43926)
})

test('作った zip を読み戻すと同じ中身になる（日本語のパスを含む）', async () => {
  const zip = createZip([
    { path: 'ストレージ/boostnote.json', data: enc.encode('{"folders":[]}') },
    { path: 'ストレージ/notes/a.cson', data: enc.encode('title: "あ"') }
  ])
  const entries = await readZip(zip)
  assert.deepEqual(
    entries.map(e => [e.path, dec.decode(e.data)]),
    [
      ['ストレージ/boostnote.json', '{"folders":[]}'],
      ['ストレージ/notes/a.cson', 'title: "あ"']
    ]
  )
})

test('作った zip は OS の unzip でも展開できる', t => {
  let unzip
  try {
    unzip = execFileSync('which', ['unzip']).toString().trim()
  } catch {
    t.skip('unzip が無い')
    return
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'))
  const file = path.join(dir, 'a.zip')
  fs.writeFileSync(
    file,
    createZip([{ path: 'BoostRecord/notes/x.cson', data: enc.encode('ok') }])
  )
  execFileSync(unzip, ['-q', file, '-d', dir])
  assert.equal(
    fs.readFileSync(path.join(dir, 'BoostRecord/notes/x.cson'), 'utf8'),
    'ok'
  )
})

// deflate の zip を手で組む（OS の zip が作る形）
function deflatedZip(name, text) {
  const raw = enc.encode(text)
  const comp = deflateRawSync(raw)
  const n = enc.encode(name)
  const local = Buffer.alloc(30 + n.length)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(crc32(raw), 14)
  local.writeUInt32LE(comp.length, 18)
  local.writeUInt32LE(raw.length, 22)
  local.writeUInt16LE(n.length, 26)
  Buffer.from(n).copy(local, 30)
  const central = Buffer.alloc(46 + n.length)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(crc32(raw), 16)
  central.writeUInt32LE(comp.length, 20)
  central.writeUInt32LE(raw.length, 24)
  central.writeUInt16LE(n.length, 28)
  central.writeUInt32LE(0, 42)
  Buffer.from(n).copy(central, 46)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(local.length + comp.length, 16)
  return new Uint8Array(Buffer.concat([local, comp, central, end]))
}

test('deflate で圧縮された zip も読める', async () => {
  const text = 'のーと'.repeat(500)
  const [entry] = await readZip(deflatedZip('notes/a.cson', text))
  assert.equal(dec.decode(entry.data), text)
})

test('上限を超える zip は展開しない', async () => {
  const zip = deflatedZip('notes/a.cson', 'a'.repeat(100000))
  await assert.rejects(readZip(zip, { maxTotalBytes: 1000 }), /大きすぎ/)
})

test('zip でないものは読めないと伝える', async () => {
  await assert.rejects(readZip(enc.encode('not a zip at all, sorry')), /zip/)
})

/* ── ストレージの出し入れ ─────────────────────────────────────────── */

const META = JSON.stringify({ folders: [{ key: 'f1', name: 'メモ' }] })
const note = (title, folder = 'f1') =>
  CSON.stringify(
    {
      type: 'MARKDOWN_NOTE',
      folder,
      title,
      content: `# ${title}`,
      tags: [],
      isStarred: false,
      isTrashed: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    null,
    2
  )

test('フォルダごと zip にしたものから、いちばん浅い boostnote.json の隣だけを読む', async () => {
  const zip = createZip([
    { path: 'Boostnote/boostnote.json', data: enc.encode(META) },
    { path: 'Boostnote/notes/abc.cson', data: enc.encode(note('A')) },
    // macOS の圧縮で入るもの・添付・入れ子のストレージは読まない
    { path: '__MACOSX/Boostnote/._boostnote.json', data: enc.encode('x') },
    { path: 'Boostnote/notes/._abc.cson', data: enc.encode('x') },
    { path: 'Boostnote/attachments/abc/p.png', data: enc.encode('x') },
    { path: 'Boostnote/old/boostnote.json', data: enc.encode('{}') },
    { path: 'Boostnote/old/notes/zzz.cson', data: enc.encode(note('Z')) }
  ])
  const contents = await parseStorageZip(zip)
  assert.equal(contents.meta, META)
  assert.deepEqual(
    contents.notes.map(n => n.key),
    ['abc']
  )
})

test('パス片を含むノートのキーは取り込まない', async () => {
  const zip = createZip([
    { path: 'boostnote.json', data: enc.encode(META) },
    { path: 'notes/../escape.cson', data: enc.encode(note('up')) },
    { path: 'notes/..\\escape.cson', data: enc.encode(note('backslash')) },
    { path: 'notes/ok.cson', data: enc.encode(note('ok')) }
  ])
  const contents = await parseStorageZip(zip)
  assert.deepEqual(
    contents.notes.map(n => n.key),
    ['ok']
  )
})

test('boostnote.json が無い zip は取り込まない', async () => {
  const zip = createZip([{ path: 'notes/a.cson', data: enc.encode(note('A')) }])
  await assert.rejects(parseStorageZip(zip), /boostnote\.json/)
})

test('取り込みはストレージを置き換え、書き出すと同じ中身に戻る', async () => {
  const root = makeDir('storage')
  root.files['boostnote.json'] = makeFile('{"folders":[]}')
  const old = await root.getDirectoryHandle('notes', { create: true })
  old.files['old.cson'] = makeFile(note('古い'))

  const zip = createZip([
    { path: 'S/boostnote.json', data: enc.encode(META) },
    { path: 'S/notes/b.cson', data: enc.encode(note('B')) },
    { path: 'S/notes/a.cson', data: enc.encode(note('A')) }
  ])
  await replaceStorage(root, await parseStorageZip(zip))
  assert.deepEqual(Object.keys(root.dirs.notes.files).sort(), ['a.cson', 'b.cson'])

  const out = await readZip(await exportStorageZip(root))
  assert.deepEqual(
    out.map(e => e.path),
    ['BoostRecord/boostnote.json', 'BoostRecord/notes/a.cson', 'BoostRecord/notes/b.cson']
  )
  assert.equal(dec.decode(out[0].data), META)
})

/* ── OPFS のリポジトリ ───────────────────────────────────────────── */

test('初回は既定の boostnote.json を作り、空のストレージとして開く', async () => {
  const opfsRoot = makeDir('')
  const dir = await openOpfsStorage(async () => opfsRoot)
  const meta = JSON.parse(dir.files['boostnote.json'].text)
  assert.equal(meta.folders.length, 1)

  const repo = createOpfsRepository(async () => opfsRoot)
  const { storages, notes } = await repo.load()
  assert.equal(storages.length, 1)
  assert.equal(notes.length, 0)
})

test('作成・保存・削除が OPFS の中のファイルに効く', async () => {
  const opfsRoot = makeDir('')
  const repo = createOpfsRepository(async () => opfsRoot)
  await repo.load()
  const created = await repo.createNote({ folder: 'default' })
  await repo.saveNote({ ...created, content: '# 書いた', title: '書いた' })
  const files = opfsRoot.dirs.storage.dirs.notes.files
  assert.match(files[`${created.key}.cson`].text, /書いた/)
  await repo.deleteNote(created.key)
  assert.equal(Object.keys(files).length, 0)
})

test('zip を取り込むとノートが入れ替わり、そのまま保存もできる', async () => {
  const opfsRoot = makeDir('')
  const repo = createOpfsRepository(async () => opfsRoot)
  await repo.load()
  await repo.createNote({ folder: 'default' })

  const zip = createZip([
    { path: 'Boostnote/boostnote.json', data: enc.encode(META) },
    { path: 'Boostnote/notes/abc.cson', data: enc.encode(note('取り込んだ')) }
  ])
  const res = await repo.importArchive(new Blob([zip]))
  assert.deepEqual(
    res.notes.map(n => n.title),
    ['取り込んだ']
  )
  assert.equal(res.storages[0].folders[0].name, 'メモ')
  // デスクトップ版の boostnote.json は name を持たない。中のフォルダ名ではなく「このブラウザ」と出す
  assert.equal(res.storages[0].name, 'このブラウザ')
  // 取り込んだ直後の保存が「別のアプリから変更」で止まらない（更新日時を取り直している）
  await repo.saveNote({ ...res.notes[0], content: '# 直した' })
  assert.match(
    opfsRoot.dirs.storage.dirs.notes.files['abc.cson'].text,
    /直した/
  )
})

test('途中で切れた zip や、範囲外を指す目次は読めないと伝える', async () => {
  const zip = createZip([{ path: 'a.txt', data: enc.encode('hello world') }])
  // 中身の途中を切り落とし、目次（末尾）だけ残す
  const eocd = zip.length - 22
  const cdSize = new DataView(zip.buffer).getUint32(eocd + 12, true)
  const tail = zip.slice(eocd - cdSize)
  await assert.rejects(readZip(tail), /zip/)

  // ローカルヘッダの位置を範囲外に書き換える
  const bad = zip.slice()
  new DataView(bad.buffer).setUint32(eocd - cdSize + 42, 0xfffffff0, true)
  await assert.rejects(readZip(bad), /zip の目次が壊れています/)

  // 目次の数を水増しする
  const more = zip.slice()
  new DataView(more.buffer).setUint16(eocd + 10, 5, true)
  await assert.rejects(readZip(more), /zip の目次が壊れています/)
})

test('notes/ を消せなかったときは書き込まずに止める', async () => {
  const root = makeDir('storage')
  await root.getDirectoryHandle('notes', { create: true })
  root.removeEntry = async () => {
    throw new DOMException('denied', 'NoModificationAllowedError')
  }
  await assert.rejects(
    replaceStorage(root, { meta: '{}', notes: [{ key: 'a', text: 'x' }] }),
    /denied/
  )
  assert.equal(root.files['boostnote.json'], undefined)
})

test('OPFS を開けなかった後でも、次の操作で開き直す', async () => {
  const opfsRoot = makeDir('opfs')
  let fail = true
  const repo = createOpfsRepository(async () => {
    if (fail) throw new DOMException('quota', 'QuotaExceededError')
    return opfsRoot
  })
  await assert.rejects(repo.createNote({ folder: 'default' }), /quota/)
  fail = false
  const note = await repo.createNote({ folder: 'default' })
  assert.ok(note.key)
})

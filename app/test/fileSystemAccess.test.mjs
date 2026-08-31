// File System Access のリポジトリ。ブラウザ無しで回すため、使っているハンドル
// の API だけを持つ偽物を立てる。読み書きの経路と、デスクトップ版との
// 同時編集の検知をここで固定する。
import test from 'node:test'
import assert from 'node:assert/strict'
import CSON from 'cson-parser'
import {
  createFileSystemAccessRepository,
  isSafeKey,
  readStorage,
  toNote
} from '../src/data/fileSystemAccess.ts'

/* ── 偽のディレクトリハンドル ───────────────────────────────────────── */

function makeFile(text, lastModified = 1000) {
  return {
    text,
    lastModified,
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

function makeDir(name, files = {}, dirs = {}) {
  return {
    kind: 'directory',
    name,
    files,
    dirs,
    async getFileHandle(fileName, opts) {
      if (!this.files[fileName]) {
        if (!opts || !opts.create) throw new Error('NotFoundError: ' + fileName)
        this.files[fileName] = makeFile('')
      }
      return Object.assign(this.files[fileName], { kind: 'file' })
    },
    async getDirectoryHandle(dirName, opts) {
      if (!this.dirs[dirName]) {
        if (!opts || !opts.create) throw new Error('NotFoundError: ' + dirName)
        this.dirs[dirName] = makeDir(dirName)
      }
      return this.dirs[dirName]
    },
    async removeEntry(fileName) {
      if (!this.files[fileName]) throw new Error('NotFoundError: ' + fileName)
      delete this.files[fileName]
    },
    async *entries() {
      for (const [n, f] of Object.entries(this.files)) {
        yield [n, Object.assign(f, { kind: 'file' })]
      }
    },
    async queryPermission() {
      return 'granted'
    },
    async requestPermission() {
      return 'granted'
    }
  }
}

function makeStorage(noteRaws = {}) {
  const notes = {}
  for (const [key, raw] of Object.entries(noteRaws)) {
    notes[`${key}.cson`] = makeFile(CSON.stringify(raw, null, 2))
  }
  return makeDir(
    'MyStorage',
    {
      'boostnote.json': makeFile(
        JSON.stringify({ name: 'メモ', folders: [{ key: 'f1', name: '受信箱' }] })
      )
    },
    { notes: makeDir('notes', notes) }
  )
}

const sampleRaw = {
  type: 'MARKDOWN_NOTE',
  folder: 'f1',
  title: 'はじめに',
  content: '# はじめに\n',
  tags: ['wip'],
  isStarred: false,
  isTrashed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

/* ── 純粋な部分 ─────────────────────────────────────────────────────── */

test('toNote は未知の型を MARKDOWN_NOTE に寄せる', () => {
  const note = toNote({ type: 'WHAT' }, 'k1', 's1')
  assert.equal(note.type, 'MARKDOWN_NOTE')
  assert.equal(note.title, '')
  assert.deepEqual(note.tags, [])
})

test('toNote は updatedAt が無ければ createdAt を使う', () => {
  const note = toNote({ createdAt: 'X' }, 'k1', 's1')
  assert.equal(note.updatedAt, 'X')
})

test('isSafeKey はパス片を弾く', () => {
  assert.equal(isSafeKey('abc123'), true)
  assert.equal(isSafeKey(''), false)
  assert.equal(isSafeKey('a/b'), false)
  assert.equal(isSafeKey('..'), false)
  assert.equal(isSafeKey('a..b'), false)
})

/* ── 読み込み ───────────────────────────────────────────────────────── */

test('readStorage は boostnote.json と notes/*.cson を読む', async () => {
  const root = makeStorage({ n1: sampleRaw })
  const { storage, notes, mtimes } = await readStorage(root)
  assert.equal(storage.name, 'メモ')
  assert.deepEqual(storage.folders, [{ key: 'f1', name: '受信箱', color: undefined }])
  assert.equal(notes.length, 1)
  assert.equal(notes[0].title, 'はじめに')
  assert.equal(notes[0].storage, 'MyStorage')
  assert.ok(mtimes.has('n1'))
})

test('notes ディレクトリが無いストレージも空として読める', async () => {
  const root = makeDir('Empty', {
    'boostnote.json': makeFile(JSON.stringify({ name: 'E', folders: [] }))
  })
  const { notes } = await readStorage(root)
  assert.deepEqual(notes, [])
})

/* ── 書き込み ───────────────────────────────────────────────────────── */

test('saveNote は編集対象だけを書き戻し、他のフィールドを残す', async () => {
  const root = makeStorage({
    n1: { ...sampleRaw, snippets: [{ name: 'a', content: 'x' }] }
  })
  const repo = createFileSystemAccessRepository(root)
  const { notes } = await repo.load()

  await repo.saveNote({ ...notes[0], title: '書き換えた', content: '新しい本文' })

  const raw = CSON.parse(root.dirs.notes.files['n1.cson'].text)
  assert.equal(raw.title, '書き換えた')
  assert.equal(raw.content, '新しい本文')
  // 触っていないフィールドは残る
  assert.deepEqual(raw.snippets, [{ name: 'a', content: 'x' }])
  assert.equal(raw.createdAt, '2026-01-01T00:00:00.000Z')
})

test('別のアプリが同じファイルを変えていたら上書きしない', async () => {
  const root = makeStorage({ n1: sampleRaw })
  const repo = createFileSystemAccessRepository(root)
  const { notes } = await repo.load()

  // デスクトップ版が書き換えた想定
  const file = root.dirs.notes.files['n1.cson']
  file.text = CSON.stringify({ ...sampleRaw, title: '向こうの変更' }, null, 2)
  file.lastModified += 5000

  await assert.rejects(
    () => repo.saveNote({ ...notes[0], title: 'こちらの変更' }),
    /別のアプリから変更されています/
  )
  // 向こうの変更は残っている
  assert.equal(CSON.parse(file.text).title, '向こうの変更')
})

test('createNote は読み戻せるノートを作る', async () => {
  const root = makeStorage({})
  const repo = createFileSystemAccessRepository(root)
  await repo.load()

  const note = await repo.createNote({ folder: 'f1' })
  assert.ok(note.key)
  assert.equal(note.folder, 'f1')
  assert.equal(note.type, 'MARKDOWN_NOTE')

  const { notes } = await readStorage(root)
  assert.equal(notes.length, 1)
  assert.equal(notes[0].key, note.key)
})

test('作った直後のノートは競合とみなされない', async () => {
  const root = makeStorage({})
  const repo = createFileSystemAccessRepository(root)
  await repo.load()
  const note = await repo.createNote({ folder: 'f1' })
  await repo.saveNote({ ...note, title: 'あとから付けた題名' })
  const { notes } = await readStorage(root)
  assert.equal(notes[0].title, 'あとから付けた題名')
})

test('deleteNote はファイルを消す', async () => {
  const root = makeStorage({ n1: sampleRaw })
  const repo = createFileSystemAccessRepository(root)
  await repo.load()
  await repo.deleteNote('n1')
  assert.equal(root.dirs.notes.files['n1.cson'], undefined)
})

test('パス片を含むキーは読み書きしない', async () => {
  const root = makeStorage({ n1: sampleRaw })
  const repo = createFileSystemAccessRepository(root)
  await repo.load()
  await assert.rejects(() => repo.deleteNote('../outside'), /キーが不正/)
  await assert.rejects(
    () => repo.saveNote({ ...sampleRaw, key: 'a/b' }),
    /キーが不正/
  )
})

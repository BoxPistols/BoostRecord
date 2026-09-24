// 相談スレッドの保存。OneDrive上で読めない・途中までに見えるファイルを「空」とみなして
// 上書きすると、既存のスレッドが消える。読めないときは書かないことを守る
const os = require('os')
const fs = require('fs')
const path = require('path')
const {
  loadThreads,
  saveThread,
  threadsPath,
  THREADS_DIR
} = require('browser/main/lib/dataApi/aiThreads')

function tmpStorage() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-threads-'))
}

function thread(id, updatedAt) {
  return {
    id,
    mode: 'discuss',
    title: `thread ${id}`,
    createdAt: updatedAt,
    updatedAt,
    messages: [{ role: 'user', content: 'q' }]
  }
}

function ids(storage) {
  return loadThreads(storage, 'note1').threads.map(x => x.id)
}

test('ファイルが無ければ空として読み、保存すると作る', () => {
  const storage = tmpStorage()
  const loaded = loadThreads(storage, 'note1')
  expect(loaded).toEqual({ ok: true, threads: [] })
  expect(saveThread(storage, 'note1', loaded, thread('a', 1)).ok).toBe(true)
  expect(ids(storage)).toEqual(['a'])
})

test('同じidは更新し、新しい順に並べる', () => {
  const storage = tmpStorage()
  saveThread(storage, 'note1', loadThreads(storage, 'note1'), thread('a', 1))
  saveThread(storage, 'note1', loadThreads(storage, 'note1'), thread('b', 2))
  saveThread(storage, 'note1', loadThreads(storage, 'note1'), thread('a', 3))
  expect(ids(storage)).toEqual(['a', 'b'])
})

test('壊れたJSONや0バイトのファイルは空とみなさず、保存もしない', () => {
  ;['{"threads": [{"id": "x"', ''].forEach(content => {
    const storage = tmpStorage()
    const file = threadsPath(storage, 'note1')
    fs.mkdirSync(path.join(storage, THREADS_DIR))
    fs.writeFileSync(file, content)
    const loaded = loadThreads(storage, 'note1')
    expect(loaded.ok).toBe(false)
    // 読み込みに失敗した結果を渡しても書かない
    expect(saveThread(storage, 'note1', loaded, thread('a', 1)).ok).toBe(false)
    expect(fs.readFileSync(file, 'utf8')).toBe(content)
  })
})

test('開いたあとでファイルが壊れた場合も、書く直前に読み直して書かない', () => {
  const storage = tmpStorage()
  saveThread(storage, 'note1', loadThreads(storage, 'note1'), thread('a', 1))
  const file = threadsPath(storage, 'note1')
  fs.writeFileSync(file, '{"threads": [')
  const saved = saveThread(
    storage,
    'note1',
    { ok: true, threads: [] },
    thread('b', 2)
  )
  expect(saved.ok).toBe(false)
  expect(fs.readFileSync(file, 'utf8')).toBe('{"threads": [')
})

test('開いている間にほかで増えたスレッドを落とさない', () => {
  const storage = tmpStorage()
  const opened = loadThreads(storage, 'note1')
  saveThread(
    storage,
    'note1',
    loadThreads(storage, 'note1'),
    thread('other', 5)
  )
  saveThread(storage, 'note1', opened, thread('mine', 6))
  expect(ids(storage)).toEqual(['mine', 'other'])
})

test('ファイル名にならないnoteKeyや保存先が無いときは扱わない', () => {
  const storage = tmpStorage()
  expect(loadThreads(storage, '../evil').ok).toBe(false)
  expect(loadThreads(storage, '').ok).toBe(false)
  expect(loadThreads(null, 'note1').ok).toBe(false)
  expect(threadsPath(storage, 'a/b')).toBe(null)
})

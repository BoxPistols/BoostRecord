// フォルダ名をパス表記で階層に使う前提で、データ層に入れたガードのテスト。
//
// ここが緩いと被害が大きい: deleteFolder は `note.folder === folderKey` で
// ノートを選び、deleteNote はゴミ箱を経由せず物理削除する。folderKey が
// undefined のまま来ると `folder` フィールドを持たない .cson が軒並み一致する。
const deleteFolder = require('browser/main/lib/dataApi/deleteFolder')
const createFolder = require('browser/main/lib/dataApi/createFolder')
const updateFolder = require('browser/main/lib/dataApi/updateFolder')

global.document = require('jsdom').jsdom('<body></body>')
global.window = document.defaultView
global.navigator = window.navigator

const Storage = require('dom-storage')
const localStorage = (window.localStorage = global.localStorage = new Storage(
  null,
  { strict: true }
))
const path = require('path')
const os = require('os')
const sander = require('sander')
const TestDummy = require('../fixtures/TestDummy')

const storagePath = path.join(os.tmpdir(), 'test/folder-path-safety')

let storageContext
let storageKey

beforeEach(() => {
  storageContext = TestDummy.dummyStorage(storagePath)
  localStorage.setItem('storages', JSON.stringify([storageContext.cache]))
  storageKey = storageContext.cache.key
})

afterAll(() => {
  sander.rimrafSync(storagePath)
})

const rejects = promise =>
  promise.then(
    () => {
      throw new Error('expected a rejection')
    },
    err => err
  )

describe('deleteFolder のガード', () => {
  it('folderKey が未指定なら拒否する（全ノート巻き込みの入口）', async () => {
    for (const bad of [undefined, null, '', '   ', 42, {}]) {
      const err = await rejects(deleteFolder(storageKey, bad))
      expect(err.message).toBe('Invalid folder key')
    }
  })

  it('存在しない folderKey は拒否する', async () => {
    // 通すと「フォルダ一覧は1件も減らないのにノートだけ消える」形になる
    const err = await rejects(deleteFolder(storageKey, 'nosuchfolderkey'))
    expect(err.message).toMatch(/Folder not found/)
  })
})

describe('boostnote.json が壊れている時', () => {
  const corrupt = () =>
    sander.writeFileSync(
      path.join(storagePath, 'boostnote.json'),
      '{ this is not valid json'
    )

  it('空の folders を書き戻さない（全フォルダレコードを失う経路）', async () => {
    corrupt()
    const before = sander.readFileSync(
      path.join(storagePath, 'boostnote.json'),
      { encoding: 'utf-8' }
    )
    const err = await rejects(
      createFolder(storageKey, { name: 'NewOne', color: '#fff' })
    )
    expect(err.message).toMatch(/refusing to overwrite/)
    // 壊れたままでよい。上書きされていないことが重要
    // （直せば復元できる。空配列で潰すと二度と戻らない）
    const after = sander.readFileSync(
      path.join(storagePath, 'boostnote.json'),
      { encoding: 'utf-8' }
    )
    expect(after).toBe(before)
  })

  it('更新も削除も同じく拒否する', async () => {
    corrupt()
    const e1 = await rejects(
      updateFolder(storageKey, 'anykey', { name: 'X', color: '#fff' })
    )
    // 壊れていると folders は空なので「存在しない」で先に落ちるのが正しい。
    // どちらの理由であれ**書き戻さない**ことが要件
    expect(e1).toBeInstanceOf(Error)
    const e2 = await rejects(deleteFolder(storageKey, 'anykey'))
    expect(e2).toBeInstanceOf(Error)
  })
})

describe('createFolder の名前正規化', () => {
  it('正規化して空になる名前を拒否する', async () => {
    for (const bad of ['/', '///', '   ', ' / ']) {
      const err = await rejects(
        createFolder(storageKey, { name: bad, color: '#fff' })
      )
      expect(err.message).toMatch(/path segment/)
    }
  })

  it('表記ゆれを正規化して保存する', async () => {
    const data = await createFolder(storageKey, {
      name: ' KSD / onboarding / ',
      color: '#fff'
    })
    const created = data.storage.folders[data.storage.folders.length - 1]
    expect(created.name).toBe('KSD/onboarding')
  })

  it('同じ正規化パスの重複を拒否する（片方が画面から消えるため）', async () => {
    await createFolder(storageKey, { name: 'KSD/spec', color: '#fff' })
    const err = await rejects(
      createFolder(storageKey, { name: ' KSD / spec ', color: '#000' })
    )
    expect(err.message).toMatch(/already exists/)
  })
})

describe('updateFolder の名前正規化', () => {
  it('正規化して空になる名前を拒否する', async () => {
    const folderKey = storageContext.json.folders[0].key
    const err = await rejects(
      updateFolder(storageKey, folderKey, { name: '///', color: '#fff' })
    )
    expect(err.message).toMatch(/path segment/)
  })

  it('表記ゆれを正規化して保存する', async () => {
    const folderKey = storageContext.json.folders[0].key
    const data = await updateFolder(storageKey, folderKey, {
      name: '/KSD//onboarding/',
      color: '#fff'
    })
    const updated = data.storage.folders.find(f => f.key === folderKey)
    expect(updated.name).toBe('KSD/onboarding')
  })

  it('他フォルダと同じパスへのリネームを拒否する', async () => {
    const folderKey = storageContext.json.folders[0].key
    await createFolder(storageKey, { name: 'Taken/path', color: '#fff' })
    const err = await rejects(
      updateFolder(storageKey, folderKey, {
        name: ' Taken / path ',
        color: '#fff'
      })
    )
    expect(err.message).toMatch(/already exists/)
  })

  it('自分自身と同じパスへの更新は通る（色だけ変える操作を塞がない）', async () => {
    const folderKey = storageContext.json.folders[0].key
    const first = await updateFolder(storageKey, folderKey, {
      name: 'Solo/path',
      color: '#111'
    })
    expect(first.storage.folders.find(f => f.key === folderKey).name).toBe(
      'Solo/path'
    )
    const again = await updateFolder(storageKey, folderKey, {
      name: 'Solo/path',
      color: '#222'
    })
    expect(again.storage.folders.find(f => f.key === folderKey).color).toBe(
      '#222'
    )
  })
})

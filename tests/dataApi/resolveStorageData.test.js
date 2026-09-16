const os = require('os')
const fs = require('fs')
const path = require('path')
const sander = require('sander')
const CSON = require('@rokt33r/season')
const resolveStorageData = require('browser/main/lib/dataApi/resolveStorageData')

const storagePath = path.join(os.tmpdir(), 'boostnote-test-resolveStorageData')
const cache = {
  key: 's1',
  name: 'Storage',
  type: 'STORAGE',
  path: storagePath,
  isOpen: true
}

beforeEach(() => {
  sander.rimrafSync(storagePath)
  sander.mkdirSync(storagePath)
})

afterEach(() => {
  sander.rimrafSync(storagePath)
})

it('creates boostnote.json with defaults when it is missing', () => {
  return resolveStorageData(cache).then(storage => {
    expect(storage.folders).toEqual([])
    expect(storage.version).toBe('1.0')
    expect(storage.key).toBe('s1')
    expect(storage.name).toBe('Storage')
    expect(fs.existsSync(path.join(storagePath, 'boostnote.json'))).toBe(true)
  })
})

it('reads folders and version from an existing boostnote.json', () => {
  const folders = [{ key: 'f1', name: 'Folder', color: '#000000' }]
  CSON.writeFileSync(path.join(storagePath, 'boostnote.json'), {
    folders,
    version: '1.0'
  })
  return resolveStorageData(cache).then(storage => {
    expect(storage.folders).toEqual(folders)
    expect(storage.version).toBe('1.0')
    expect(storage.path).toBe(storagePath)
  })
})

it('marks the storage unreadable and keeps the original bytes when boostnote.json is broken', () => {
  const jsonPath = path.join(storagePath, 'boostnote.json')
  // 実名入りの定義が壊れた状態(パース不能)で置かれている場合
  fs.writeFileSync(jsonPath, '{ "folders": [ broken')
  return resolveStorageData(cache).then(storage => {
    expect(storage.foldersUnreadable).toBe(true)
    // 原本は書き換えられていない
    expect(fs.readFileSync(jsonPath, 'utf8')).toBe('{ "folders": [ broken')
    // 退避コピーが残る
    const backups = fs
      .readdirSync(storagePath)
      .filter(name => name.indexOf('boostnote.json.unreadable-') === 0)
    expect(backups.length).toBe(1)
  })
})

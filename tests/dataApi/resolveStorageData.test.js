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

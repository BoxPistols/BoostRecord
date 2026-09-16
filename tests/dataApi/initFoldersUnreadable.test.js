// 壊れた boostnote.json を持つストレージを init が上書きしないことを守る回帰テスト。
// 上書きすると、実名入りのフォルダ定義が Unknown N に置き換わって永久に失われる
const os = require('os')
const fs = require('fs')
const path = require('path')
const sander = require('sander')
const CSON = require('@rokt33r/season')

global.document = require('jsdom').jsdom('<body></body>')
global.window = document.defaultView
global.navigator = window.navigator

const Storage = require('dom-storage')
const localStorage = (window.localStorage = global.localStorage = new Storage(
  null,
  { strict: true }
))

const init = require('browser/main/lib/dataApi/init')

const storagePath = path.join(os.tmpdir(), 'boostnote-test-init-unreadable')
const BROKEN_SOURCE = '{ "folders": [ broken'

beforeEach(() => {
  sander.rimrafSync(storagePath)
  sander.mkdirSync(storagePath)
  sander.mkdirSync(path.join(storagePath, 'notes'))
  // フォルダに所属するノートを2件置く(init の Unknown N 再生成を誘発する)
  CSON.writeFileSync(path.join(storagePath, 'notes', 'n1.cson'), {
    type: 'MARKDOWN_NOTE',
    title: 'note one',
    content: 'one',
    folder: 'realfolderkey01',
    tags: [],
    isStarred: false,
    isTrashed: false,
    createdAt: new Date(),
    updatedAt: new Date()
  })
  CSON.writeFileSync(path.join(storagePath, 'notes', 'n2.cson'), {
    type: 'MARKDOWN_NOTE',
    title: 'note two',
    content: 'two',
    folder: 'realfolderkey02',
    tags: [],
    isStarred: false,
    isTrashed: false,
    createdAt: new Date(),
    updatedAt: new Date()
  })
  fs.writeFileSync(path.join(storagePath, 'boostnote.json'), BROKEN_SOURCE)
  localStorage.setItem(
    'storages',
    JSON.stringify([
      {
        key: 'unreadable-storage',
        name: 'Notes',
        type: 'FILESYSTEM',
        path: storagePath,
        isOpen: true
      }
    ])
  )
})

afterEach(() => {
  localStorage.clear()
  sander.rimrafSync(storagePath)
})

it('keeps the broken boostnote.json untouched instead of writing Unknown folders', () => {
  return init().then(data => {
    // ノートは読める(救済のため Unknown N がメモリ上には作られる)
    expect(data.notes.length).toBe(2)
    const storage = data.storages[0]
    expect(storage.foldersUnreadable).toBe(true)
    expect(storage.folders.map(folder => folder.name)).toEqual([
      'Unknown 1',
      'Unknown 2'
    ])
    // ディスク上の原本は書き換わっていない
    expect(
      fs.readFileSync(path.join(storagePath, 'boostnote.json'), 'utf8')
    ).toBe(BROKEN_SOURCE)
  })
})

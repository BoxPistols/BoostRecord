const test = require('ava')
const createNoteFromUrl = require('browser/main/lib/dataApi/createNoteFromUrl')

global.document = require('jsdom').jsdom('<body></body>')
global.window = document.defaultView
global.navigator = window.navigator

const Storage = require('dom-storage')
const localStorage = window.localStorage = global.localStorage = new Storage(null, { strict: true })
const path = require('path')
const TestDummy = require('../fixtures/TestDummy')
const sander = require('sander')
const os = require('os')
const CSON = require('@rokt33r/season')
const faker = require('faker')

const storagePath = path.join(os.tmpdir(), 'test/create-note-from-url')

test.beforeEach((t) => {
  t.context.storage = TestDummy.dummyStorage(storagePath)
  localStorage.setItem('storages', JSON.stringify([t.context.storage.cache]))
})

test.serial('Create a note from URL', (t) => {
  const storageKey = t.context.storage.cache.key
  const folderKey = t.context.storage.json.folders[0].key

  const url = 'https://shapeshed.com/writing-cross-platform-node/'


  return Promise.resolve()
    .then(function doTest () {
      return Promise.all([
        createNoteFromUrl(url, storageKey, folderKey)
      ])
    })
    .then(function assert (data) {
      const data1 = data[0]

      console.log("STORM LOOK HERE", data1)

      t.is(storageKey, data1.storage)
      const jsonData2 = CSON.readFileSync(path.join(storagePath, 'notes', data1.key + '.cson'))
      t.is(input2.content, data2.content)
      t.is(input2.content, jsonData2.content)
      t.is(input2.tags.length, data2.tags.length)
      t.is(input2.tags.length, jsonData2.tags.length)
    })
})

test.after(function after () {
  localStorage.clear()
  sander.rimrafSync(storagePath)
})

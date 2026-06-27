const test = require('ava')
const updateSnippet = require('browser/main/lib/dataApi/updateSnippet')
const sander = require('sander')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const snippetFilePath = path.join(os.tmpdir(), 'test', 'update-snippet')
const snippetFile = path.join(snippetFilePath, 'snippets.json')
const oldSnippet = {
  id: crypto.randomBytes(16).toString('hex'),
  name: 'Initial snippet',
  prefix: [],
  content: ''
}

const newSnippet = {
  id: oldSnippet.id,
  name: 'new name',
  prefix: ['prefix'],
  content: 'new content'
}

test.beforeEach(t => {
  sander.writeFileSync(snippetFile, JSON.stringify([oldSnippet]))
})

test.serial('Update a snippet', t => {
  return Promise.resolve()
    .then(function doTest() {
      return Promise.all([updateSnippet(newSnippet, snippetFile)])
    })
    .then(function assert() {
      const snippets = JSON.parse(sander.readFileSync(snippetFile))
      const snippet = snippets.find(
        currentSnippet => currentSnippet.id === newSnippet.id
      )
      t.not(snippet, undefined)
      t.is(snippet.name, newSnippet.name)
      t.deepEqual(snippet.prefix, newSnippet.prefix)
      t.is(snippet.content, newSnippet.content)
    })
})

test.serial(
  'Updating a non-existent snippet resolves instead of hanging',
  t => {
    const missing = {
      id: crypto.randomBytes(16).toString('hex'),
      name: 'ghost',
      prefix: [],
      content: ''
    }
    // Before the fix the promise never settled when no snippet matched, so any
    // caller awaiting it hung forever. It must resolve with the snippet list.
    return updateSnippet(missing, snippetFile).then(snippets => {
      t.true(Array.isArray(snippets))
      t.is(snippets.length, 1)
    })
  }
)

test.after.always(() => {
  sander.rimrafSync(snippetFilePath)
})

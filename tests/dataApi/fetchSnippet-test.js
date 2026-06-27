const test = require('ava')
const fetchSnippet = require('browser/main/lib/dataApi/fetchSnippet')
const sander = require('sander')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const snippetFilePath = path.join(os.tmpdir(), 'test', 'fetch-snippet')
const snippetFile = path.join(snippetFilePath, 'snippets.json')
const snippetA = {
  id: crypto.randomBytes(16).toString('hex'),
  name: 'A',
  prefix: [],
  content: 'a'
}
const snippetB = {
  id: crypto.randomBytes(16).toString('hex'),
  name: 'B',
  prefix: [],
  content: 'b'
}

test.beforeEach(t => {
  sander.writeFileSync(snippetFile, JSON.stringify([snippetA, snippetB]))
})

test.serial('Fetching without an id returns every snippet', t => {
  return fetchSnippet(null, snippetFile).then(snippets => {
    t.true(Array.isArray(snippets))
    t.is(snippets.length, 2)
  })
})

test.serial('Fetching with an id returns the matching snippet', t => {
  return fetchSnippet(snippetB.id, snippetFile).then(snippet => {
    t.is(snippet.id, snippetB.id)
    t.is(snippet.name, 'B')
  })
})

test.serial('Fetching from a missing file rejects cleanly', t => {
  // Before the fix, the error branch lacked a return, so it fell through to
  // JSON.parse(undefined) and threw inside the fs callback after rejecting.
  const missingFile = path.join(snippetFilePath, 'does-not-exist.json')
  return t.throws(fetchSnippet(null, missingFile))
})

test.after.always(() => {
  sander.rimrafSync(snippetFilePath)
})

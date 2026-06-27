import fs from 'fs'
import consts from 'browser/lib/consts'

function fetchSnippet(id, snippetFile) {
  return new Promise((resolve, reject) => {
    fs.readFile(snippetFile || consts.SNIPPET_FILE, 'utf8', (err, data) => {
      if (err) {
        // Return early; otherwise JSON.parse(undefined) throws inside this
        // callback after the promise has already been rejected.
        reject(err)
        return
      }
      const snippets = JSON.parse(data)
      if (id) {
        const snippet = snippets.find(snippet => {
          return snippet.id === id
        })
        resolve(snippet)
      } else {
        resolve(snippets)
      }
    })
  })
}

module.exports = fetchSnippet

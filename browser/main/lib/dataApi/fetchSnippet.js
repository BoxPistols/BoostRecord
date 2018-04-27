import fs from 'fs'
import crypto from 'crypto'
import consts from 'browser/lib/consts'

function fetchSnippet (id) {
  return new Promise((resolve, reject) => {
    fs.readFile(consts.SNIPPET_FILE, 'utf8', (err, data) => {
      if (err) {
        reject(err)
      }
      const snippets = JSON.parse(data)
      if (id) {
        const snippet = snippets.find(snippet => { return snippet.id === id })
        resolve(snippet)
      }
      resolve(snippets)
    })
  })
}

module.exports = fetchSnippet

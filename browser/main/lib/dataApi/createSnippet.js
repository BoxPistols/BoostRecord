import fs from 'fs'
import crypto from 'crypto'
import consts from 'browser/lib/consts'
import fetchSnippet from 'browser/main/lib/dataApi/fetchSnippet'

function createSnippet () {
  return new Promise((resolve, reject) => {
    fetchSnippet().then((snippets) => {
      const newSnippet = {
        id: crypto.randomBytes(16).toString('hex'),
        name: 'Unnamed snippet',
        prefix: [],
        content: ''
      }
      snippets.push(newSnippet)
      fs.writeFile(consts.SNIPPET_FILE, JSON.stringify(snippets, null, 4), (err) => {
        if (err) reject(err)
        resolve(newSnippet)
      })
    })
  })
}

module.exports = createSnippet

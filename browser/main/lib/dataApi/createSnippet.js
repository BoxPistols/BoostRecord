import fs from 'fs'
import crypto from 'crypto'
import consts from 'browser/lib/consts'

function createSnippet (snippets) {
  return new Promise((resolve, reject) => {
    const newSnippet = {
      id: crypto.randomBytes(16).toString('hex'),
      name: 'Unnamed snippet',
      prefix: [],
      content: ''
    }
    snippets.push(newSnippet)
    fs.writeFile(consts.SNIPPET_FILE, JSON.stringify(snippets, null, 4), (err) => {
      if (err) reject(err)
      resolve(snippets)
    })
  })
}

module.exports = createSnippet

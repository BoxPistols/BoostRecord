import fs from 'fs'
import consts from 'browser/lib/consts'
import fetchSnippet from 'browser/main/lib/dataApi/fetchSnippet'

function deleteSnippet (snippet) {
  return new Promise((resolve, reject) => {
    fetchSnippet().then((snippets) => {
      snippets = snippets.filter(currentSnippet => currentSnippet.id !== snippet.id)
      fs.writeFile(consts.SNIPPET_FILE, JSON.stringify(snippets, null, 4), (err) => {
        if (err) reject(err)
        resolve(snippet)
      })
    })
  })
}

module.exports = deleteSnippet

const { remote } = require('electron')
import fs from 'fs'
import path from 'path'
import consts from 'browser/lib/consts'

function deleteSnippet (snippets, snippetId) {
  return new Promise((resolve, reject) => {
    for(let i = 0; i < snippets.length; i++) {
      if (snippets[i].id === snippetId) {
        snippets.splice(i, 1);
        fs.writeFile(consts.SNIPPET_FILE, JSON.stringify(snippets, null, 4), (err) => {
          if (err) reject(err)
          resolve(snippets)
        })
      }
    }
  }) 
}

module.exports = deleteSnippet
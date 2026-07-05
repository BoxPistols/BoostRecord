import formatHTML from './formatHTML'
const remote = require('@electron/remote')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

export default function formatPDF(props) {
  return function(note, targetPath, exportTasks) {
    // The HTML must go through a temp file, NOT an unencoded data: URL —
    // the inline <style> in <head> is full of '#hex' colors, and everything
    // after the first '#' of a data: URL is parsed as a fragment, so the
    // <body> never reached the page and every exported PDF came out blank.
    const html = formatHTML(props)(note, targetPath, exportTasks)
    const tmpFile = path.join(
      os.tmpdir(),
      `the-boosters-pdf-${crypto.randomBytes(6).toString('hex')}.html`
    )
    fs.writeFileSync(tmpFile, html, 'utf8')

    const printout = new remote.BrowserWindow({
      show: false,
      webPreferences: { webSecurity: false, javascript: false }
    })

    // loadFile (NOT loadURL('file://…'), which fails with ERR_FAILED on
    // Electron 28) resolves once the page has finished loading, replacing
    // the old `did-finish-load` listener that could miss fast loads because
    // remote listeners are registered asynchronously.
    return printout
      .loadFile(tmpFile)
      .then(() => printout.webContents.printToPDF({}))
      .finally(() => {
        printout.destroy()
        try {
          fs.unlinkSync(tmpFile)
        } catch (e) {}
      })
  }
}

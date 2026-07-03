import formatHTML from './formatHTML'
const remote = require('@electron/remote')

export default function formatPDF(props) {
  return function(note, targetPath, exportTasks) {
    const printout = new remote.BrowserWindow({
      show: false,
      webPreferences: { webSecurity: false, javascript: false }
    })

    printout.loadURL(
      'data:text/html;charset=UTF-8,' +
        formatHTML(props)(note, targetPath, exportTasks)
    )

    return new Promise((resolve, reject) => {
      printout.webContents.on('did-finish-load', () => {
        // Electron 6+: printToPDF returns a Promise<Buffer> (was callback-based).
        printout.webContents
          .printToPDF({})
          .then(data => resolve(data))
          .catch(err => reject(err))
          .finally(() => printout.destroy())
      })
    })
  }
}

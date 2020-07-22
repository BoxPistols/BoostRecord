import formatHTML from './formatHTML'
import { remote } from 'electron'

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
        printout.webContents.printToPDF({}, (err, data) => {
          if (err) reject(err)
          else resolve(data)
          printout.destroy()
        })
      })
    })
  }
}

const exec = require('child_process').exec
const path = require('path')
let lastHeartbeat = 0

function sendWakatimeHeartBeat (storagePath, noteKey, storageName, isWrite, hasFileChanges, isFileChange) {

  if (new Date().getTime() - lastHeartbeat > 120000 || isFileChange) {
    const notePath = path.join(storagePath, 'notes', noteKey + '.cson')

    if (!isWrite && !hasFileChanges && !isFileChange) {
      return
    }

    // TODO: add --key sdasdsa-sdsad-asdasd-asdsa-asdasdadas from configuration UI or use ~/.wakatime.conf
    exec(`wakatime --file ${notePath} --project ${storageName} --plugin Boostnote-wakatime`, (error, stdOut, stdErr) => {
      if (error) {
        console.log(error)
      } else {
        lastHeartbeat = new Date()
        console.log('wakatime', 'isWrite', isWrite, 'hasChanges', hasFileChanges)
      }
    })
  }
}

export { sendWakatimeHeartBeat }

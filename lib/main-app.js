const electron = require('electron')
const app = electron.app
const Menu = electron.Menu
const ipc = electron.ipcMain
const shell = electron.shell
const { isPackaged } = app
const electronConfig = new (require('electron-config'))()
// electron.crashReporter.start()
const singleInstance = app.requestSingleInstanceLock()

var ipcServer = null

var mainWindow = null

// Single Instance Lock
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, it should focus the existing instance.
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

let updateFound = false

// 2026-07: the old electron-gh-releases updater pointed at the dead upstream
// repo (BoostIO/boost-releases) and its Squirrel backend can't apply updates
// to an unsigned mac app anyway. Replaced with a plain GitHub "newer release
// exists?" check that opens the download page — works unsigned, no deps.
const UPDATE_REPO = 'BoxPistols/TheBoosters'
let latestReleaseUrl = `https://github.com/${UPDATE_REPO}/releases/latest`
const { isNewerVersion } = require('./update-check')

function checkUpdate(manualTriggered = false) {
  if (!isPackaged) {
    // Prevents app from attempting to update when in dev mode.
    console.log('Updates are disabled in Development mode, see main-app.js')
    return true
  }

  // End if auto updates disabled and it is an automatic check
  if (!electronConfig.get('autoUpdateEnabled', true) && !manualTriggered) return

  if (updateFound) {
    return true
  }

  fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'the-boosters-update-check'
    }
  })
    .then(res => {
      if (!res.ok) throw new Error(`GitHub API responded ${res.status}`)
      return res.json()
    })
    .then(release => {
      const latest = String(release.tag_name || '').replace(/^v/, '')
      if (latest && isNewerVersion(latest, app.getVersion())) {
        latestReleaseUrl = release.html_url || latestReleaseUrl
        updateFound = true
        mainWindow.webContents.send('update-found', 'Update available!')
      } else if (manualTriggered) {
        mainWindow.webContents.send(
          'update-not-found',
          'There is no newer version.'
        )
      }
    })
    .catch(err => {
      console.error('Updater error! %s', err.message)
      if (manualTriggered) {
        mainWindow.webContents.send('update-not-found', 'Updater error')
      }
    })
}

ipc.on('update-app-confirm', () => {
  shell.openExternal(latestReleaseUrl)
})

ipc.on('update-cancel', () => {
  updateFound = false
})

ipc.on('update-download-confirm', () => {
  // Unsigned builds can't self-install; hand off to the release page.
  shell.openExternal(latestReleaseUrl)
})

app.on('window-all-closed', function() {
  app.quit()
})

app.on('ready', function() {
  mainWindow = require('./main-window')

  var template = require('./main-menu')
  var menu = Menu.buildFromTemplate(template)
  var touchBarMenu = require('./touchbar-menu')
  switch (process.platform) {
    case 'darwin':
      Menu.setApplicationMenu(menu)
      mainWindow.setTouchBar(touchBarMenu)
      break
    case 'win32':
      mainWindow.setMenu(menu)
      break
    case 'linux':
      Menu.setApplicationMenu(menu)
      mainWindow.setMenu(menu)
  }

  // Check update every day
  setInterval(function() {
    if (isPackaged) checkUpdate()
  }, 1000 * 60 * 60 * 24)

  // Check update after 10 secs to prevent file locking of Windows
  setTimeout(() => {
    if (isPackaged) checkUpdate()

    ipc.on('update-check', function(event, msg) {
      if (updateFound) {
        mainWindow.webContents.send('update-found', 'Update available!')
      } else {
        checkUpdate(msg === 'manual')
      }
    })
  }, 10 * 1000)
  ipcServer = require('./ipcServer')
  ipcServer.server.start()

  // Inline AI writing-assist (OpenAI / Gemini): main-process streaming endpoint.
  require('./ai/ipc').registerAiIpc()
})

module.exports = app

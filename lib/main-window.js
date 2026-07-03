const electron = require('electron')
const app = electron.app
const BrowserWindow = electron.BrowserWindow
// Electron 14+ removed the built-in `remote` module; @electron/remote is the
// drop-in replacement. initialize() once here, enable() per window below.
const remoteMain = require('@electron/remote/main')
remoteMain.initialize()
const path = require('path')
const Config = require('electron-config')
const config = new Config()
const _ = require('lodash')

// set up some chrome extensions
if (process.env.NODE_ENV === 'development') {
  const {
    default: installExtension,
    REACT_DEVELOPER_TOOLS,
    REACT_PERF
  } = require('electron-devtools-installer')

  require('electron-debug')({ showDevTools: false })

  const ChromeLens = {
    // ID of the extension (https://chrome.google.com/webstore/detail/chromelens/idikgljglpfilbhaboonnpnnincjhjkd)
    id: 'idikgljglpfilbhaboonnpnnincjhjkd',
    electron: '>=1.2.1'
  }

  const extensions = [REACT_DEVELOPER_TOOLS, REACT_PERF, ChromeLens]

  for (const extension of extensions) {
    // installExtension returns a Promise; a try/catch can't catch its async
    // rejection, so a failed devtools download (e.g. cross-unzip exit code 9)
    // previously surfaced as a noisy UnhandledPromiseRejection on every dev
    // launch. Attach .catch() to handle it gracefully.
    Promise.resolve(installExtension(extension)).catch(e => {
      console.error(`[ELECTRON] Extension installation failed`, e)
    })
  }
}

const windowSize = config.get('windowsize') || {
  x: null,
  y: null,
  width: 1080,
  height: 720
}

const mainWindow = new BrowserWindow({
  x: windowSize.x,
  y: windowSize.y,
  width: windowSize.width,
  height: windowSize.height,
  useContentSize: true,
  minWidth: 500,
  minHeight: 320,
  webPreferences: {
    // Electron 42: the legacy renderer uses require()/remote directly, so keep
    // node integration on and context isolation off for now. Hardening to
    // contextIsolation:true + a preload/contextBridge is a later phase (S8).
    nodeIntegration: true,
    contextIsolation: false,
    // Electron 20+ defaults sandbox:true, which disables full node integration
    // and makes @electron/remote throw "sandboxed renderers required". The
    // legacy renderer needs the unsandboxed classic model.
    sandbox: false
  },
  icon: path.resolve(__dirname, '../resources/app.png')
})
remoteMain.enable(mainWindow.webContents)

// Dev only: forward renderer console messages to the main stdout so they show
// up in the terminal (useful while migrating; renderer errors otherwise only
// appear in DevTools). Electron 28 signature: (event, level, message, line, src).
if (process.env.NODE_ENV === 'development') {
  mainWindow.webContents.on(
    'console-message',
    (e, level, message, line, src) => {
      console.log(
        `[renderer] ${message}  (${String(src)
          .split('/')
          .pop()}:${line})`
      )
    }
  )
}

const url = path.resolve(
  __dirname,
  process.env.NODE_ENV === 'development'
    ? './main.development.html'
    : './main.production.html'
)

mainWindow.loadURL('file://' + url)
mainWindow.setMenuBarVisibility(false)

// Electron 22 removed the 'new-window' event; setWindowOpenHandler replaces it.
// 'deny' blocks the app from spawning new windows on link clicks (prior behaviour).
mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

mainWindow.webContents.sendInputEvent({
  type: 'keyDown',
  keyCode: '\u0008'
})

mainWindow.webContents.sendInputEvent({
  type: 'keyUp',
  keyCode: '\u0008'
})

if (process.platform === 'darwin') {
  mainWindow.on('close', function(e) {
    e.preventDefault()
    if (mainWindow.isFullScreen()) {
      mainWindow.once('leave-full-screen', function() {
        mainWindow.hide()
      })
      mainWindow.setFullScreen(false)
    } else {
      mainWindow.hide()
    }
  })

  app.on('before-quit', function(e) {
    mainWindow.removeAllListeners()
  })
}

mainWindow.on('resize', _.throttle(storeWindowSize, 500))
mainWindow.on('move', _.throttle(storeWindowSize, 500))

function storeWindowSize() {
  try {
    config.set('windowsize', mainWindow.getBounds())
  } catch (e) {
    // ignore any errors because an error occurs only on update
    // refs: https://github.com/BoostIO/Boostnote/issues/243
  }
}

app.on('activate', function() {
  if (mainWindow == null) return null
  mainWindow.show()
})

module.exports = mainWindow

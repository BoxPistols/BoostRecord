'use strict'

// Minimal, secure Electron shell for the modern app. Loads the Vite-built
// renderer and bridges a single IPC channel that reads the user's real
// `.cson` storages from disk (BOOSTNOTE_STORAGE = path-separated storage roots).
//
//   npm run build && BOOSTNOTE_STORAGE=/path/to/storage npm run electron

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const { loadStorages } = require('./loadNotes.cjs')

function storageRoots() {
  const raw = process.env.BOOSTNOTE_STORAGE
  return raw ? raw.split(path.delimiter).filter(Boolean) : []
}

ipcMain.handle('notes:load', () => {
  try {
    return loadStorages(storageRoots())
  } catch (err) {
    console.error('notes:load failed:', err)
    return { storages: [], notes: [], error: String(err) }
  }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1e2126',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

'use strict'

// Secure Electron shell for The Boosters. Loads the Vite-built renderer and
// bridges two IPC channels:
//   notes:load        -> read the configured + env .cson storages
//   notes:pickStorage -> let the user pick a storage folder (persisted)
//
// Storage roots come from a persisted config (userData/config.json) and/or the
// BOOSTNOTE_STORAGE env var (path-separated). A "storage" is a folder with a
// boostnote.json + notes/*.cson.

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { loadStorages } = require('./loadNotes.cjs')

const configPath = () => path.join(app.getPath('userData'), 'config.json')

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'))
  } catch {
    return { storageRoots: [] }
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2))
}

function envRoots() {
  const raw = process.env.BOOSTNOTE_STORAGE
  return raw ? raw.split(path.delimiter).filter(Boolean) : []
}

function allRoots() {
  const fromConfig = readConfig().storageRoots || []
  return [...new Set([...fromConfig, ...envRoots()])]
}

function load() {
  try {
    return loadStorages(allRoots())
  } catch (err) {
    console.error('notes:load failed:', err)
    return { storages: [], notes: [], error: String(err) }
  }
}

ipcMain.handle('notes:load', () => load())

// Let the user pick a Boostnote storage folder; persist it and return notes.
ipcMain.handle('notes:pickStorage', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Boostnote ストレージフォルダを選択（boostnote.json があるフォルダ）',
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || res.filePaths.length === 0) return null

  const picked = res.filePaths[0]
  if (!fs.existsSync(path.join(picked, 'boostnote.json'))) {
    return {
      storages: [],
      notes: [],
      error: '選択したフォルダに boostnote.json が見つかりません。'
    }
  }

  const config = readConfig()
  const roots = new Set(config.storageRoots || [])
  roots.add(picked)
  writeConfig({ ...config, storageRoots: [...roots] })
  return load()
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

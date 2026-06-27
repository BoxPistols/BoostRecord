'use strict'

// Exposes a minimal, safe surface to the renderer. The renderer never gets
// Node or ipcRenderer directly — only this typed `window.boostnote` API.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('boostnote', {
  loadNotes: () => ipcRenderer.invoke('notes:load')
})

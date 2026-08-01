// Main-process IPC endpoint for bookmark-card page screenshots.
//
// Renderer calls `ipcRenderer.invoke('screenshot:capture', url)` and gets a
// PNG data URL of the page rendered in a hidden, sandboxed BrowserWindow.
// Captures run strictly one at a time (queue) and results are cached for 30
// minutes, so re-renders of the preview don't re-load pages. The hidden
// window is fully locked down: sandboxed, no node, popups denied, navigation
// away from the target blocked, and always destroyed afterwards.
const { ipcMain, BrowserWindow } = require('electron')

const CACHE_TTL = 30 * 60 * 1000
const CACHE_MAX_ENTRIES = 40
const CAPTURE_TIMEOUT = 20 * 1000
const SETTLE_DELAY = 1500 // let hero images/fonts finish after did-finish-load
const VIEW_WIDTH = 1024
const VIEW_HEIGHT = 640
const OUTPUT_WIDTH = 640

const cache = new Map() // url -> { expiresAt, promise }
let queueTail = Promise.resolve()

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim())
}

function capture(url) {
  return new Promise((resolve, reject) => {
    let win = new BrowserWindow({
      show: false,
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true
      }
    })

    let settled = false
    const cleanup = () => {
      if (win !== null && !win.isDestroyed()) win.destroy()
      win = null
    }
    const fail = err => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      reject(err instanceof Error ? err : new Error(String(err)))
    }
    const timer = setTimeout(
      () => fail(new Error('screenshot: timed out')),
      CAPTURE_TIMEOUT
    )

    try {
      win.webContents.setAudioMuted(true)
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.webContents.on('will-navigate', (e, target) => {
        // Allow the initial load and same-page redirects handled by loadURL;
        // block the page scripting itself elsewhere.
        if (target !== url) e.preventDefault()
      })
      win.webContents.once('did-fail-load', (e, code, description) => {
        fail(new Error(`screenshot: load failed (${description || code})`))
      })
      win.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          if (settled || win === null || win.isDestroyed()) return
          win.webContents
            .capturePage()
            .then(image => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              const resized = image.resize({ width: OUTPUT_WIDTH })
              const dataUrl = resized.toDataURL()
              cleanup()
              resolve(dataUrl)
            })
            .catch(fail)
        }, SETTLE_DELAY)
      })
      win.loadURL(url)
    } catch (err) {
      fail(err)
    }
  })
}

function enqueue(job) {
  const result = queueTail.then(job)
  queueTail = result.catch(() => {})
  return result
}

function captureUrlScreenshot(url) {
  if (!isHttpUrl(url)) {
    return Promise.reject(new Error('screenshot: only http(s) URLs'))
  }
  const now = Date.now()
  const hit = cache.get(url)
  if (hit !== undefined && hit.expiresAt > now) return hit.promise

  const promise = enqueue(() => capture(url)).catch(err => {
    cache.delete(url) // don't pin failures for the full TTL
    throw err
  })
  cache.set(url, { expiresAt: now + CACHE_TTL, promise })
  if (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value)
  }
  return promise
}

let registered = false

function registerScreenshotIpc() {
  if (registered) return
  registered = true
  ipcMain.handle('screenshot:capture', (event, url) =>
    captureUrlScreenshot(url)
  )
}

module.exports = { registerScreenshotIpc, captureUrlScreenshot, isHttpUrl }

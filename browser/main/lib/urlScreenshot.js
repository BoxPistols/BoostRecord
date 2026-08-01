// Renderer-side wrapper over the main-process 'screenshot:capture' IPC
// (see lib/screenshot/ipc.js).
//
// captureUrlScreenshot(url) resolves with a PNG data URL of the rendered
// page. The main process caches captures, but the data URL itself is a few
// hundred KB — cache it here too so preview re-renders (every keystroke in
// split mode) don't re-ship it over IPC.
const { ipcRenderer } = require('electron')

const CACHE_TTL = 30 * 60 * 1000
const CACHE_MAX_ENTRIES = 40

const cache = new Map() // url -> { expiresAt, promise }

export function captureUrlScreenshot(url) {
  const now = Date.now()
  const hit = cache.get(url)
  if (hit !== undefined && hit.expiresAt > now) return hit.promise

  const promise = ipcRenderer.invoke('screenshot:capture', url).catch(err => {
    cache.delete(url)
    throw err
  })
  cache.set(url, { expiresAt: now + CACHE_TTL, promise })
  if (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value)
  }
  return promise
}

export function clearScreenshotCache() {
  cache.clear()
}

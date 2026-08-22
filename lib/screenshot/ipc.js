// Main-process IPC endpoint for bookmark-card page screenshots.
//
// Renderer calls `ipcRenderer.invoke('screenshot:capture', url)` and gets a
// PNG data URL of the page rendered in a hidden, sandboxed BrowserWindow.
// Captures run strictly one at a time (queue) and results are cached for 30
// minutes, so re-renders of the preview don't re-load pages. The hidden
// window is fully locked down: sandboxed, no node, popups denied, navigation
// away from the target blocked, and always destroyed afterwards.
const { ipcMain, BrowserWindow } = require('electron')
const dns = require('dns')
const net = require('net')

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

// ---- SSRF guard -----------------------------------------------------------
// The URL comes over IPC and ends up in BrowserWindow.loadURL, so loopback,
// RFC1918, link-local and cloud-metadata destinations must never be loaded.

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return true
  const a = parts[0]
  const b = parts[1]
  return (
    a === 0 || // "this network"
    a === 10 || // RFC1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local incl. 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 168) || // RFC1918
    (a === 192 && b === 0) || // IETF reserved 192.0.0/24, 192.0.2/24
    (a === 198 && (b === 18 || b === 19)) || // benchmarking 198.18/15
    a >= 224 // multicast / reserved / broadcast
  )
}

function isPrivateAddress(ip) {
  const version = net.isIP(ip)
  if (version === 4) return isPrivateIPv4(ip)
  if (version === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::' || lower === '::1') return true
    if (/^fe[89ab]/.test(lower)) return true // link-local fe80::/10
    if (/^f[cd]/.test(lower)) return true // ULA fc00::/7
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
    if (mapped) return isPrivateIPv4(mapped[1])
    return false
  }
  return true // not a literal IP — resolve before deciding
}

function isForbiddenHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '' ||
    host.length > 253
  )
}

function assertPublicDestination(url) {
  let hostname
  try {
    hostname = new URL(url).hostname.replace(/^\[|\]$/g, '')
  } catch (e) {
    return Promise.reject(new Error('screenshot: invalid URL'))
  }
  const refused = () =>
    Promise.reject(new Error('screenshot: private destination refused'))
  if (isForbiddenHostname(hostname)) return refused()
  if (net.isIP(hostname)) {
    return isPrivateAddress(hostname) ? refused() : Promise.resolve()
  }
  return dns.promises
    .lookup(hostname, { all: true, verbatim: true })
    .then(addresses => {
      if (
        addresses.length === 0 ||
        addresses.some(entry => isPrivateAddress(entry.address))
      ) {
        throw new Error('screenshot: private destination refused')
      }
    })
}

function capture(url) {
  return assertPublicDestination(url).then(() => captureInWindow(url))
}

function captureInWindow(url) {
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
      win.webContents.on('will-redirect', (e, target) => {
        // HTTP 30x could bounce to a private destination. Block what's
        // sync-checkable here; re-validate resolvable hostnames right after
        // (fail() destroys the window well before the capture fires).
        let hostname = null
        try {
          const parsed = new URL(target)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            e.preventDefault()
            return fail(new Error('screenshot: redirect refused'))
          }
          hostname = parsed.hostname.replace(/^\[|\]$/g, '')
        } catch (err) {
          e.preventDefault()
          return fail(new Error('screenshot: redirect refused'))
        }
        if (
          isForbiddenHostname(hostname) ||
          (net.isIP(hostname) && isPrivateAddress(hostname))
        ) {
          e.preventDefault()
          return fail(new Error('screenshot: private destination refused'))
        }
        assertPublicDestination(target).catch(fail)
      })
      // Subframes (ads, trackers, blocked third parties) fail routinely on
      // real pages; only a main-frame failure means the capture is worthless.
      win.webContents.on(
        'did-fail-load',
        (e, code, description, validatedURL, isMainFrame) => {
          if (isMainFrame === false) return
          fail(new Error(`screenshot: load failed (${description || code})`))
        }
      )
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

module.exports = {
  registerScreenshotIpc,
  captureUrlScreenshot,
  isHttpUrl,
  // exported for unit tests
  isPrivateAddress,
  isForbiddenHostname,
  assertPublicDestination
}

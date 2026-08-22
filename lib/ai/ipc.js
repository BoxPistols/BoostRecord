// Main-process IPC endpoint for the inline AI writing-assist.
//
// Renderer calls `ipcRenderer.invoke('ai:run', req)`. Text deltas stream back on
// the `ai:chunk` channel as `{ runId, delta }`; the invoke promise resolves with
// the full text (the renderer treats that as "done") or rejects on error (the
// renderer shows the message).
//
// Keys: the key typed into Preferences wins, else the OS credential store, else
// the provider's env var. The store has **no read channel** — the renderer can
// ask whether a provider is configured, never what the key is.
const { ipcMain, safeStorage, app } = require('electron')
const path = require('path')
const { streamCompletion } = require('./aiService')
const { resolveKey, hasEnvKey } = require('./keys')
const { createSecureKeyStore, STORE_FILENAME } = require('./secureKeys')

const PROVIDERS = ['openai', 'gemini']

let registered = false
let store = null

function getStore() {
  if (!store) {
    store = createSecureKeyStore({
      safeStorage,
      filePath: path.join(app.getPath('userData'), STORE_FILENAME)
    })
  }
  return store
}

function registerAiIpc() {
  if (registered) return
  registered = true

  ipcMain.handle('ai:run', (event, req) => {
    req = req || {}
    const apiKey = resolveKey(
      req.provider,
      req.apiKey,
      getStore().get(req.provider)
    )
    return streamCompletion(Object.assign({}, req, { apiKey }), delta => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('ai:chunk', { runId: req.runId, delta })
      }
    })
  })

  // 「暗号化が使えるか」「provider ごとに設定済みか」「環境変数だけで動くか」
  // の3つだけを返す。いずれも真偽値で、キー本体を返す channel は意図的に作らない
  ipcMain.handle('ai:keys-status', () => {
    const s = getStore()
    const fromEnv = {}
    PROVIDERS.forEach(provider => {
      fromEnv[provider] = hasEnvKey(provider)
    })
    return {
      available: s.isAvailable(),
      configured: s.listConfigured(PROVIDERS),
      fromEnv
    }
  })

  ipcMain.handle('ai:keys-set', (event, req) => {
    req = req || {}
    if (PROVIDERS.indexOf(req.provider) === -1) {
      return { ok: false, error: 'UNKNOWN_PROVIDER' }
    }
    return getStore().set(req.provider, req.key)
  })
}

// resolveKey is exported for unit testing (override > stored > env precedence).
module.exports = { registerAiIpc, resolveKey }

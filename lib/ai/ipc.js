// Main-process IPC endpoint for the inline AI writing-assist.
//
// Renderer calls `ipcRenderer.invoke('ai:run', req)`. Text deltas stream back on
// the `ai:chunk` channel as `{ runId, delta }`; the invoke promise resolves with
// the full text (the renderer treats that as "done") or rejects on error (the
// renderer shows the message). Keys: the Preferences override wins, else the
// provider's env var.
const { ipcMain } = require('electron')
const { streamCompletion } = require('./aiService')
const { resolveKey } = require('./keys')

let registered = false

function registerAiIpc() {
  if (registered) return
  registered = true
  ipcMain.handle('ai:run', (event, req) => {
    req = req || {}
    const apiKey = resolveKey(req.provider, req.apiKey)
    return streamCompletion(Object.assign({}, req, { apiKey }), delta => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('ai:chunk', { runId: req.runId, delta })
      }
    })
  })
}

// resolveKey is exported for unit testing (override-wins-else-env precedence).
module.exports = { registerAiIpc, resolveKey }

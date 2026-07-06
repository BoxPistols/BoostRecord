// Main-process IPC handler for VOICEVOX text-to-speech.
//
// Renderer calls `ipcRenderer.invoke('tts:speak', { text, speakerId? })`.
// Returns `{ ok: true, wav: Uint8Array }` on success, or `{ ok: false, reason }`.
//
// VOICEVOX must be running locally on localhost:50021 (default port).
// Two-step API:  POST /audio_query  →  POST /synthesis  →  WAV binary.
const { ipcMain } = require('electron')
const http = require('http')

const VOICEVOX_HOST = 'localhost'
const VOICEVOX_PORT = 50021
const DEFAULT_SPEAKER = 1 // ずんだもん (ノーマル)
const MAX_TEXT_LEN = 500 // VOICEVOX は長文で遅延するので上限を設ける

let registered = false

// Minimal http helper (avoids adding node-fetch / axios).
function httpPost(path, body, binaryResponse = false) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
    const req = http.request(
      {
        hostname: VOICEVOX_HOST,
        port: VOICEVOX_PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        }
      },
      res => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          if (res.statusCode >= 400) {
            reject(
              new Error(`VOICEVOX HTTP ${res.statusCode}: ${buf.slice(0, 200)}`)
            )
          } else {
            resolve(binaryResponse ? buf : JSON.parse(buf.toString()))
          }
        })
      }
    )
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

async function voicevoxSpeak(text, speakerId) {
  const trimmed = text.slice(0, MAX_TEXT_LEN)
  const query = await httpPost(
    `/audio_query?text=${encodeURIComponent(trimmed)}&speaker=${speakerId}`,
    '{}'
  )
  const wav = await httpPost(
    `/synthesis?speaker=${speakerId}`,
    query,
    true /* binary */
  )
  return wav
}

function registerTtsIpc() {
  if (registered) return
  registered = true

  ipcMain.handle('tts:speak', async (event, req) => {
    const { text = '', speakerId = DEFAULT_SPEAKER } = req || {}
    if (!text.trim()) return { ok: false, reason: 'empty text' }
    try {
      const wav = await voicevoxSpeak(text, speakerId)
      // Uint8Array is transferable via Electron's structured clone (no base64 overhead).
      return {
        ok: true,
        wav: new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength)
      }
    } catch (e) {
      return { ok: false, reason: e.message }
    }
  })
}

module.exports = { registerTtsIpc }

// Main-process IPC handler for VOICEVOX text-to-speech.
//
// Renderer calls:
//   ipcRenderer.invoke('tts:ping',     { port })                         → { ok, version }
//   ipcRenderer.invoke('tts:speakers', { port })                         → { ok, speakers }
//   ipcRenderer.invoke('tts:speak',    { text, speakerId, port, params, speedMultiplier })
//                                                                        → { ok, wav: Uint8Array }
//
// VOICEVOX must be running locally on 127.0.0.1:50021 (default port).
// Two-step API:  POST /audio_query  →  (apply params)  →  POST /synthesis  →  WAV binary.
const { ipcMain } = require('electron')
const http = require('http')
const { applyVoicevoxParams, TTS_IPC_VERSION } = require('./params')

// 'localhost' だと Node 18 (Electron 28) は ::1 を先に引き、127.0.0.1 だけで
// 待つ VOICEVOX に ECONNREFUSED になる。実測: 2026-09-05
const VOICEVOX_HOST = '127.0.0.1'
const DEFAULT_PORT = 50021
// 里石ユカ（つぼみ）。利用者指定 2026-09-05。ID はエンジン側の /speakers 由来
const DEFAULT_SPEAKER = 126
const MAX_TEXT_LEN = 500 // VOICEVOX は長文で遅延するので上限を設ける
const REQUEST_TIMEOUT = 30000 // 合成は長文だと数秒かかる。ping は別途短くする

let registered = false

// Minimal http helper (avoids adding node-fetch / axios).
function request(method, port, path, body, opts = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr =
      body == null
        ? null
        : typeof body === 'string'
        ? body
        : JSON.stringify(body)
    const headers = {}
    if (bodyStr != null) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(bodyStr)
    }
    const req = http.request(
      { hostname: VOICEVOX_HOST, port, path, method, headers },
      res => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          if (res.statusCode >= 400) {
            const err = new Error(
              `VOICEVOX HTTP ${res.statusCode}: ${buf.slice(0, 200)}`
            )
            err.statusCode = res.statusCode
            reject(err)
          } else {
            resolve(opts.binary ? buf : JSON.parse(buf.toString() || 'null'))
          }
        })
      }
    )
    // 接続だけ受け付けて応答しない相手（ポートの指定違い等）に当たると、
    // タイムアウトが無いと promise が永久に解決しない
    req.setTimeout(opts.timeout || REQUEST_TIMEOUT, () =>
      req.destroy(new Error('timeout'))
    )
    req.on('error', reject)
    if (bodyStr != null) req.write(bodyStr)
    req.end()
  })
}

async function voicevoxSpeak(text, speakerId, port, params, speedMultiplier) {
  const trimmed = text.slice(0, MAX_TEXT_LEN)
  let query
  try {
    query = await request(
      'POST',
      port,
      `/audio_query?text=${encodeURIComponent(trimmed)}&speaker=${speakerId}`,
      '{}'
    )
  } catch (e) {
    // 話者 ID が無いときエンジンは 422 を返す。ID の数字だけ見せても
    // 利用者は直せないので、設定画面へ誘導する文にする
    if (e.statusCode === 422 || e.statusCode === 404) {
      throw new Error(
        `話者 ID ${speakerId} はこの VOICEVOX にありません。設定 > AI > 読み上げ で話者を選び直してください。`
      )
    }
    throw e
  }
  const tuned = applyVoicevoxParams(query, params, speedMultiplier)
  return request('POST', port, `/synthesis?speaker=${speakerId}`, tuned, {
    binary: true
  })
}

// エンジンが起動しているかを確かめる。設定画面の「接続テスト」用。
async function voicevoxPing(port) {
  const body = await request('GET', port, '/version', null, {
    timeout: 5000
  })
  return String(body).replace(/^"|"$/g, '')
}

// 話者一覧。renderer で使う形（名前 + スタイル）に絞って返す。
// type が 'talk' 以外（歌唱用）は読み上げに使えないので落とす
async function voicevoxSpeakers(port) {
  const list = await request('GET', port, '/speakers', null, {
    timeout: 5000
  })
  return (Array.isArray(list) ? list : []).map(s => ({
    name: s.name,
    uuid: s.speaker_uuid,
    styles: (s.styles || [])
      .filter(st => !st.type || st.type === 'talk')
      .map(st => ({ id: st.id, name: st.name }))
  }))
}

// VOICEVOX 本体で登録したプリセット（プリセット › 新規登録）。
// 本体の「デフォルト」は API に出ないので、保存したものだけが並ぶ
async function voicevoxPresets(port) {
  const list = await request('GET', port, '/presets', null, { timeout: 5000 })
  return (Array.isArray(list) ? list : []).map(p => ({
    id: p.id,
    name: p.name,
    speakerUuid: p.speaker_uuid,
    styleId: p.style_id,
    // 本体のキー名からアプリ側のキー名へ
    params: {
      speed: p.speedScale,
      pitch: p.pitchScale,
      intonation: p.intonationScale,
      volume: p.volumeScale,
      pauseScale: p.pauseLengthScale,
      prePause: p.prePhonemeLength,
      postPause: p.postPhonemeLength
    }
  }))
}

function registerTtsIpc() {
  if (registered) return
  registered = true

  ipcMain.handle('tts:ping', async (event, req) => {
    const { port = DEFAULT_PORT } = req || {}
    try {
      return {
        ok: true,
        version: await voicevoxPing(port),
        ipcVersion: TTS_IPC_VERSION
      }
    } catch (e) {
      return { ok: false, reason: e.message }
    }
  })

  ipcMain.handle('tts:speakers', async (event, req) => {
    const { port = DEFAULT_PORT } = req || {}
    try {
      return {
        ok: true,
        speakers: await voicevoxSpeakers(port),
        ipcVersion: TTS_IPC_VERSION
      }
    } catch (e) {
      return { ok: false, reason: e.message }
    }
  })

  ipcMain.handle('tts:presets', async (event, req) => {
    const { port = DEFAULT_PORT } = req || {}
    try {
      return {
        ok: true,
        presets: await voicevoxPresets(port),
        ipcVersion: TTS_IPC_VERSION
      }
    } catch (e) {
      return { ok: false, reason: e.message }
    }
  })

  ipcMain.handle('tts:speak', async (event, req) => {
    const {
      text = '',
      speakerId = DEFAULT_SPEAKER,
      port = DEFAULT_PORT,
      params,
      speedMultiplier
    } = req || {}
    if (!text.trim()) return { ok: false, reason: 'empty text' }
    try {
      const wav = await voicevoxSpeak(
        text,
        speakerId,
        port,
        params,
        speedMultiplier
      )
      // Uint8Array is transferable via Electron's structured clone (no base64 overhead).
      return {
        ok: true,
        ipcVersion: TTS_IPC_VERSION,
        wav: new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength)
      }
    } catch (e) {
      return { ok: false, reason: e.message }
    }
  })
}

module.exports = { registerTtsIpc, DEFAULT_SPEAKER, DEFAULT_PORT }

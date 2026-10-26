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
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { streamCompletion } = require('./aiService')
const { resolveKey, hasEnvKey } = require('./keys')
const { createSecureKeyStore, STORE_FILENAME } = require('./secureKeys')
const { detectImageMime, isSupportedMime } = require('./imageInput')
const { loadImage } = require('../ocr/loadImage')
const { runVisionOcr, isVisionAvailable } = require('../ocr/visionOcr')
const {
  runWindowsOcr,
  getWindowsOcrLanguages,
  isWindowsOcrPlatform
} = require('../ocr/windowsOcr')

const PROVIDERS = ['openai', 'gemini']

const OCR_SYSTEM = [
  'You transcribe text from an image.',
  'Output only the text that appears in the image, in reading order, in the original language. Keep bullets and numbering as written.',
  // 「改行を保つ」だけだとGeminiは見た目の折り返しごとに1行で返すので、まとまりの単位を指定する
  'Join lines that are only wrapped visually within the same paragraph, heading, list item, or box into one line. Keep a line break only where the text itself starts a new line, such as a new list item or a new line of a poem or code.',
  'Separate distinct blocks (paragraphs, headings, boxes in a diagram, table cells, captions) with one blank line.',
  'Do not describe the image, translate, summarize, or add commentary. If there is no text, output nothing.'
].join('\n')

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

  // 「provider ごとに設定済みか」「環境変数だけで動くか」を返す。いずれも
  // 真偽値で、キー本体を返す channel は意図的に作らない。
  //
  // **ここで暗号化の可否を調べない。** safeStorage.isEncryptionAvailable() は
  // macOS でキーチェーンを読むので、許可ダイアログの対象になる。この channel は
  // 設定画面を開いただけで呼ばれるため、AI を使っていない利用者にまでダイアログ
  // が出ていた。可否は ai:keys-encryption で、実際に預ける直前にだけ調べる
  ipcMain.handle('ai:keys-status', () => {
    const s = getStore()
    const fromEnv = {}
    PROVIDERS.forEach(provider => {
      fromEnv[provider] = hasEnvKey(provider)
    })
    return {
      configured: s.listConfigured(PROVIDERS),
      fromEnv
    }
  })

  // 暗号化して預けられるか。キーチェーンに触るので、保存の直前にだけ呼ぶ
  ipcMain.handle('ai:keys-encryption', () => ({
    available: getStore().isAvailable()
  }))

  // 画像の文字を読む。engineが'vision'なら端末内（macOSはVision、WindowsはWindows.Media.Ocr）、
  // 'ai'なら設定中のモデルに送る。'vision'は保存済みの設定値なので名前は変えない
  // onDevice: 端末内の方式の種類（'macos' / 'windows' / null）
  // japanese: 日本語を読めるか。Windowsは日本語の言語を追加していないと英語などしか読めない
  ipcMain.handle('ocr:capabilities', async () => {
    if (isVisionAvailable()) {
      return { vision: true, onDevice: 'macos', japanese: true }
    }
    const languages = await getWindowsOcrLanguages()
    if (languages.length > 0) {
      return {
        vision: true,
        onDevice: 'windows',
        japanese: languages.some(tag => /^ja\b/i.test(tag))
      }
    }
    return { vision: false, onDevice: null, japanese: false }
  })

  const runOnDeviceOcr = filePath =>
    isWindowsOcrPlatform() ? runWindowsOcr(filePath) : runVisionOcr(filePath)

  ipcMain.handle('ocr:run', async (event, req) => {
    req = req || {}
    const { buffer, filePath } = await loadImage(req.src)
    if (req.engine === 'vision') {
      if (!isVisionAvailable() && !isWindowsOcrPlatform()) {
        throw new Error('OCR_VISION_UNAVAILABLE')
      }
      if (filePath)
        return {
          text: await runOnDeviceOcr(filePath),
          usage: null,
          truncated: false
        }
      // 取得した画像は一時ファイルに書いてから渡し、終わったら消す
      // 名前は推測できないようにし、既にあるファイルには書かない（wx）
      // 拡張子は中身から付ける（読み取り側が名前で形式を決めても外さないように）
      const mime = detectImageMime(buffer)
      const ext = mime ? `.${mime.split('/')[1]}` : ''
      const tmp = path.join(
        app.getPath('temp'),
        `boostrecord-ocr-${crypto.randomBytes(16).toString('hex')}${ext}`
      )
      await fs.promises.writeFile(tmp, buffer, { flag: 'wx' })
      try {
        return {
          text: await runOnDeviceOcr(tmp),
          usage: null,
          truncated: false
        }
      } finally {
        fs.promises.unlink(tmp).catch(() => {})
      }
    }
    const mime = detectImageMime(buffer)
    if (!isSupportedMime(mime)) throw new Error('OCR_IMAGE_FORMAT_UNSUPPORTED')
    const apiKey = resolveKey(
      req.provider,
      req.apiKey,
      getStore().get(req.provider)
    )
    // 使用量は料金の概算に、truncatedは「出力の上限で途中まで」の表示に使う
    let finish = { usage: null, truncated: false }
    const text = await streamCompletion(
      {
        provider: req.provider,
        model: req.model,
        apiKey,
        system: OCR_SYSTEM,
        prompt: 'Transcribe the text in this image.',
        image: { mime, base64: buffer.toString('base64') },
        // 文字の多いスライドでも切れないよう広めに取る。課金は実際の出力分だけ
        maxOutputTokens: 16000,
        temperature: 0,
        reasoningEffort: 'low'
      },
      null,
      info => {
        finish = info
      }
    )
    return { text, usage: finish.usage, truncated: finish.truncated }
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

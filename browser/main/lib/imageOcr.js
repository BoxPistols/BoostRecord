// 画像の文字の読み取り（mainプロセスの'ocr:run'、lib/ai/ipc.js）をレンダラから呼ぶ
const { ipcRenderer } = require('electron')
import ConfigManager from 'browser/main/lib/ConfigManager'
import { DEFAULT_MODELS, estimateCostUsd } from 'browser/main/lib/aiModels'
import { unwrapIpcError } from 'browser/main/lib/aiAssist'
import i18n from 'browser/lib/i18n'

// main側のエラーコードを画面の文言に置き換える。コード以外（APIのエラー本文など）はそのまま出す
const ERROR_MESSAGES = {
  OCR_IMAGE_FORMAT_UNSUPPORTED: () =>
    i18n.__(
      'This image format cannot be sent to AI (PNG, JPEG, WebP, GIF only). Try on-device recognition.'
    ),
  OCR_VISION_UNAVAILABLE: () =>
    i18n.__('On-device recognition is available on macOS 13 or later.'),
  IMAGE_SRC_UNSUPPORTED: () => i18n.__('This image cannot be read.'),
  IMAGE_SRC_EMPTY: () => i18n.__('This image cannot be read.'),
  IMAGE_DATA_URL_INVALID: () => i18n.__('This image cannot be read.'),
  IMAGE_TOO_LARGE: () => i18n.__('The image is too large to read (20 MB max).'),
  IMAGE_FETCH_FAILED: () => i18n.__('Could not download the image.'),
  'ENOENT:': () => i18n.__('The image file was not found.')
}

// 時間切れのときはコードではなく、AbortErrorの英語のメッセージが返る
const ABORT_PATTERN = /aborted/i

let capabilities = null

/**
 * 使える読み取り方式。macOS以外では端末内の方式を出さない
 * @returns {Promise<{vision: boolean}>}
 */
export function getOcrCapabilities() {
  if (!capabilities) {
    capabilities = ipcRenderer
      .invoke('ocr:capabilities')
      .catch(() => ({ vision: false }))
  }
  return capabilities
}

export function getOcrEngine() {
  const ocr = ConfigManager.get().ocr || {}
  return ocr.engine === 'vision' ? 'vision' : 'ai'
}

export function setOcrEngine(engine) {
  ConfigManager.set({ ocr: { engine } })
}

function formatUsd(value) {
  // 1回ぶんは1セント未満が多いので、有効数字2桁で出す
  return `$${value >= 0.01 ? value.toFixed(3) : value.toPrecision(2)}`
}

/**
 * 使用量と料金の概算を1行にする。単価を載せていないモデルは料金を出さない
 * @param {string} model
 * @param {{inputTokens:number, outputTokens:number}|null} usage
 * @returns {string}
 */
export function formatUsageNote(model, usage) {
  if (!usage) return ''
  const tokens = i18n.__(
    'Tokens: %s in / %s out',
    usage.inputTokens.toLocaleString('en-US'),
    usage.outputTokens.toLocaleString('en-US')
  )
  const cost = estimateCostUsd(model, usage)
  const price =
    cost == null
      ? i18n.__('No price on file for %s', model)
      : i18n.__('About %s at %s rates', formatUsd(cost), model)
  return `${tokens} · ${price}`
}

/**
 * @param {string} src 画像のsrc（file:// / data: / http(s)）
 * @param {'ai'|'vision'} engine
 * @returns {Promise<{text: string, note: string, warning: string}>}
 *   noteは使用量と料金の概算、warningは出力の上限で途中までになったときの注意
 */
export function extractImageText(src, engine) {
  const ai = ConfigManager.get().ai || {}
  const provider = ai.provider || 'openai'
  const providerCfg = ai[provider] || {}
  const model = providerCfg.model || DEFAULT_MODELS[provider]
  return ipcRenderer
    .invoke('ocr:run', {
      src,
      engine,
      provider,
      model,
      apiKey: providerCfg.apiKey || ''
    })
    .then(result => ({
      text: result.text,
      note: formatUsageNote(model, result.usage),
      warning: result.truncated
        ? i18n.__(
            'The output limit was reached, so only part of the text was read.'
          )
        : ''
    }))
    .catch(err => {
      const message = unwrapIpcError(err)
      const code = message.split(' ')[0]
      if (ERROR_MESSAGES[code]) throw new Error(ERROR_MESSAGES[code]())
      if (ABORT_PATTERN.test(message)) {
        throw new Error(i18n.__('Reading the image took too long.'))
      }
      throw new Error(message)
    })
}

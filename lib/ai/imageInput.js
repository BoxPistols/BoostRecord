// 画像を読み取らせるためのリクエスト組み立て。SDKを読まない純粋関数だけを置き、
// jestの古いBabelでもテストできるようにしている（aiService.jsはfor awaitを含む）

// OpenAIのChat Completionsが画像入力として受け付ける形式。SVG・HEIC・TIFFは400になる
const SUPPORTED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/**
 * 先頭のバイト列から画像の形式を判定する。拡張子は当てにしない
 * @param {Buffer} buffer
 * @returns {string|null} MIMEタイプ。判定できなければnull
 */
function detectImageMime(buffer) {
  if (!buffer || buffer.length < 12) return null
  const hex = buffer.slice(0, 12).toString('hex')
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png'
  if (hex.startsWith('ffd8ff')) return 'image/jpeg'
  if (hex.startsWith('47494638')) return 'image/gif'
  // RIFF....WEBP
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') {
    return 'image/webp'
  }
  return null
}

function isSupportedMime(mime) {
  return SUPPORTED_MIME.indexOf(mime) !== -1
}

/**
 * OpenAIのmessagesを組み立てる。画像が無ければ従来どおり文字列だけを送る
 * @param {{system:string, prompt:string, image?:{mime:string, base64:string}}} opts
 */
function buildOpenAiMessages(opts) {
  if (!opts.image) {
    return [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.prompt }
    ]
  }
  return [
    { role: 'system', content: opts.system },
    {
      role: 'user',
      content: [
        { type: 'text', text: opts.prompt },
        {
          type: 'image_url',
          // 日本語の小さい文字を読ませるため、縮小せずに渡す
          image_url: {
            url: `data:${opts.image.mime};base64,${opts.image.base64}`,
            detail: 'high'
          }
        }
      ]
    }
  ]
}

/**
 * Geminiのcontentsを組み立てる
 * @param {{prompt:string, image?:{mime:string, base64:string}}} opts
 */
function buildGeminiContents(opts) {
  const parts = [{ text: opts.prompt }]
  if (opts.image) {
    parts.push({
      inlineData: { mimeType: opts.image.mime, data: opts.image.base64 }
    })
  }
  return [{ role: 'user', parts }]
}

module.exports = {
  SUPPORTED_MIME,
  detectImageMime,
  isSupportedMime,
  buildOpenAiMessages,
  buildGeminiContents
}

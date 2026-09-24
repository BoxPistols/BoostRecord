/**
 * @fileoverview lib/ai/imageInputとlib/ocr/loadImageのテスト
 */
const {
  detectImageMime,
  isSupportedMime,
  buildOpenAiMessages,
  buildGeminiContents
} = require('../../lib/ai/imageInput')
const { decodeDataUrl } = require('../../lib/ocr/loadImage')
const { isVisionAvailable } = require('../../lib/ocr/visionOcr')
const {
  normalizeOpenAiUsage,
  normalizeGeminiUsage
} = require('../../lib/ai/usage')

function bytes(hex) {
  return Buffer.concat([Buffer.from(hex, 'hex'), Buffer.alloc(16)])
}

test('先頭のバイト列で画像の形式を判定する', () => {
  // [先頭のバイト列, 期待するMIME]
  const testCases = [
    ['89504e470d0a1a0a', 'image/png'],
    ['ffd8ffe0', 'image/jpeg'],
    ['474946383961', 'image/gif'],
    ['52494646000000005745425056503820', 'image/webp'],
    // SVGはテキストなので判定しない（OpenAIに送ると400になる）
    [Buffer.from('<svg xmlns=').toString('hex'), null]
  ]
  testCases.forEach(([hex, expected]) => {
    expect(detectImageMime(bytes(hex))).toBe(expected)
  })
  expect(detectImageMime(Buffer.alloc(4))).toBe(null)
  expect(isSupportedMime('image/png')).toBe(true)
  expect(isSupportedMime(null)).toBe(false)
})

test('画像が無ければOpenAIには従来どおり文字列だけを送る', () => {
  expect(buildOpenAiMessages({ system: 's', prompt: 'p' })).toEqual([
    { role: 'system', content: 's' },
    { role: 'user', content: 'p' }
  ])
})

test('画像があればOpenAIにはdata URLを高解像度で渡す', () => {
  const messages = buildOpenAiMessages({
    system: 's',
    prompt: 'p',
    image: { mime: 'image/png', base64: 'AAAA' }
  })
  expect(messages[1].content).toEqual([
    { type: 'text', text: 'p' },
    {
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,AAAA', detail: 'high' }
    }
  ])
})

test('Geminiには画像をinlineDataで渡す', () => {
  expect(
    buildGeminiContents({
      prompt: 'p',
      image: { mime: 'image/jpeg', base64: 'BBBB' }
    })
  ).toEqual([
    {
      role: 'user',
      parts: [
        { text: 'p' },
        { inlineData: { mimeType: 'image/jpeg', data: 'BBBB' } }
      ]
    }
  ])
  expect(buildGeminiContents({ prompt: 'p' })).toEqual([
    { role: 'user', parts: [{ text: 'p' }] }
  ])
})

test('data URLをバイト列に戻す', () => {
  expect(decodeDataUrl('data:image/png;base64,iVBORw==').toString('hex')).toBe(
    '89504e47'
  )
  expect(decodeDataUrl('data:image/svg+xml,%3Csvg%3E').toString()).toBe('<svg>')
  expect(decodeDataUrl('not a data url')).toBe(null)
})

test('OpenAIの使用量をそろえる。推論トークンは出力に含まれたまま', () => {
  expect(
    normalizeOpenAiUsage({
      prompt_tokens: 1200,
      completion_tokens: 300,
      prompt_tokens_details: { cached_tokens: 200 },
      completion_tokens_details: { reasoning_tokens: 50 }
    })
  ).toEqual({
    inputTokens: 1200,
    cachedInputTokens: 200,
    outputTokens: 300,
    reasoningTokens: 50
  })
  expect(normalizeOpenAiUsage(null)).toBe(null)
})

test('Geminiの使用量をそろえる。思考トークンは出力に足す', () => {
  expect(
    normalizeGeminiUsage({
      promptTokenCount: 900,
      candidatesTokenCount: 100,
      thoughtsTokenCount: 40
    })
  ).toEqual({
    inputTokens: 900,
    cachedInputTokens: 0,
    outputTokens: 140,
    reasoningTokens: 40
  })
})

test('端末内の読み取りはmacOS 13（Darwin 22）以降だけで出す', () => {
  // [platform, release, 期待]
  const testCases = [
    ['darwin', '22.1.0', true],
    ['darwin', '27.0.0', true],
    ['darwin', '21.6.0', false],
    ['win32', '10.0.22631', false],
    ['linux', '6.1.0', false]
  ]
  testCases.forEach(([platform, release, expected]) => {
    expect(isVisionAvailable(platform, release)).toBe(expected)
  })
})

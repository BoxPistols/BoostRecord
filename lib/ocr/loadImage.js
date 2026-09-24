/* global AbortController */
// プレビューの<img src>から画像のバイト列を取り出す（mainプロセス）。
// file:// はパスに戻し、data: はデコードし、http(s) は取得する
const fs = require('fs')
const url = require('url')

const MAX_BYTES = 20 * 1024 * 1024
// 応答しないサーバーで読み取りが止まり続けないよう時限を切る
const FETCH_TIMEOUT_MS = 30 * 1000

// 本文を読みながら数え、上限を超えた時点で打ち切る。
// 全部読んでから大きさを見ると、Content-Lengthの無い応答で上限を超えてメモリを使う
async function readLimited(res, controller) {
  const reader = res.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_BYTES) {
      controller.abort()
      throw new Error('IMAGE_TOO_LARGE')
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

/**
 * data: URLをバイト列に戻す。base64以外（URLエンコード）も受ける
 * @param {string} src
 * @returns {Buffer|null}
 */
function decodeDataUrl(src) {
  const m = /^data:[^,]*?(;base64)?,([\s\S]*)$/.exec(src)
  if (!m) return null
  return m[1]
    ? Buffer.from(m[2], 'base64')
    : Buffer.from(decodeURIComponent(m[2]), 'utf8')
}

/**
 * @param {string} src
 * @returns {Promise<{buffer: Buffer, filePath: string|null}>}
 *   filePathはローカルのファイルのときだけ入る（macOSの文字認識はパスで渡す）
 */
async function loadImage(src) {
  if (typeof src !== 'string' || src === '') {
    throw new Error('IMAGE_SRC_EMPTY')
  }
  if (src.startsWith('file:')) {
    // 日本語や空白を含むパスはパーセントエンコードされているのでfileURLToPathで戻す
    const filePath = url.fileURLToPath(src.split(/[?#]/)[0])
    return { buffer: await fs.promises.readFile(filePath), filePath }
  }
  if (src.startsWith('data:')) {
    const buffer = decodeDataUrl(src)
    if (!buffer) throw new Error('IMAGE_DATA_URL_INVALID')
    return { buffer, filePath: null }
  }
  if (/^https?:/i.test(src)) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(src, { signal: controller.signal })
      if (!res.ok) throw new Error(`IMAGE_FETCH_FAILED ${res.status}`)
      return { buffer: await readLimited(res, controller), filePath: null }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error('IMAGE_SRC_UNSUPPORTED')
}

module.exports = { loadImage, decodeDataUrl }

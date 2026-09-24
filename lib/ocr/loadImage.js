// プレビューの<img src>から画像のバイト列を取り出す（mainプロセス）。
// file:// はパスに戻し、data: はデコードし、http(s) は取得する
const fs = require('fs')
const url = require('url')

const MAX_BYTES = 20 * 1024 * 1024

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
    const res = await fetch(src)
    if (!res.ok) throw new Error(`IMAGE_FETCH_FAILED ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > MAX_BYTES) throw new Error('IMAGE_TOO_LARGE')
    return { buffer, filePath: null }
  }
  throw new Error('IMAGE_SRC_UNSUPPORTED')
}

module.exports = { loadImage, decodeDataUrl }

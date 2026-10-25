// zip の読み書き。ライブラリを入れずに、ストレージの取り込みと書き出しに要る分だけを持つ。
//
// 書き出しは無圧縮（method 0）。.cson はテキストで小さく、圧縮しないほうが
// 実装が短く、展開側（Finder・エクスプローラー・unzip）を選ばない。
// 読み込みは無圧縮と deflate（method 8）。deflate はブラウザ標準の
// DecompressionStream('deflate-raw') で戻す。ZIP64 と暗号化は扱わない。

export interface ZipEntry {
  path: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// zip の日時は MS-DOS 形式（2 秒単位、1980 年以降）
function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

// 汎用フラグの bit 11。ファイル名が UTF-8 であることを示す（日本語のフォルダ名のため）
const UTF8_FLAG = 0x0800

/** 無圧縮の zip を作る */
export function createZip(
  entries: ZipEntry[],
  now = new Date()
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const { time, date } = dosDateTime(now)
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.path)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, UTF8_FLAG, true)
    lv.setUint16(8, 0, true)
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, UTF8_FLAG, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)

    locals.push(local, entry.data)
    centrals.push(central)
    offset += local.length + size
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const out = new Uint8Array(offset + centralSize + end.length)
  let pos = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

/* ── 読み込み ───────────────────────────────────────────────────────── */

// 展開後の合計の上限。圧縮率の高い zip（zip bomb）でタブのメモリを使い切らない
const DEFAULT_MAX_TOTAL = 200 * 1024 * 1024

export interface ReadZipOptions {
  /** 展開するエントリだけ true を返す。添付など要らないものは展開しない */
  filter?: (path: string) => boolean
  maxTotalBytes?: number
}

function findEndOfCentralDirectory(view: DataView): number {
  // 末尾のコメントは最大 65535 バイト。そこまで遡って署名を探す
  const min = Math.max(0, view.byteLength - 22 - 0xffff)
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i
  }
  throw new Error('zip ファイルとして読めませんでした')
}

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  // slice で ArrayBuffer を持つ複製にする（Blob は SharedArrayBuffer 由来の配列を受けない）
  const stream = new Blob([data.slice()])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    // 申告より大きく展開されるものは途中で止める
    if (total > limit) {
      await reader.cancel()
      throw new Error('zip の中身が大きすぎます')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}

/** zip を読む。ディレクトリのエントリは返さない */
export async function readZip(
  bytes: Uint8Array,
  options: ReadZipOptions = {}
): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEndOfCentralDirectory(view)
  const count = view.getUint16(eocd + 10, true)
  let pos = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  const maxTotal = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL
  let total = 0
  const out: ZipEntry[] = []

  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) {
      throw new Error('zip の目次が壊れています')
    }
    const flags = view.getUint16(pos + 8, true)
    const method = view.getUint16(pos + 10, true)
    const compSize = view.getUint32(pos + 20, true)
    const size = view.getUint32(pos + 24, true)
    const nameLen = view.getUint16(pos + 28, true)
    const extraLen = view.getUint16(pos + 30, true)
    const commentLen = view.getUint16(pos + 32, true)
    const localOffset = view.getUint32(pos + 42, true)
    const path = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen))
    pos += 46 + nameLen + extraLen + commentLen

    if (path.endsWith('/')) continue
    if (options.filter && !options.filter(path)) continue
    if (flags & 1) throw new Error('暗号化された zip は読めません')
    if (compSize === 0xffffffff || size === 0xffffffff) {
      throw new Error('大きすぎる zip（ZIP64）は読めません')
    }
    total += size
    if (total > maxTotal) throw new Error('zip の中身が大きすぎます')

    // データの位置はローカルヘッダの長さで決まる（目次と extra の長さが違うことがある）
    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + localNameLen + localExtraLen
    const raw = bytes.subarray(start, start + compSize)

    let data: Uint8Array
    if (method === 0) data = raw.slice()
    else if (method === 8) data = await inflateRaw(raw, size)
    else throw new Error(`この圧縮方式（${method}）の zip は読めません`)
    out.push({ path, data })
  }
  return out
}

// 添付ファイル。デスクトップ版（browser/main/lib/dataApi/attachmentManagement.js）は、
// ストレージの attachments/<ノートのキー>/<ファイル名> に置いたファイルを本文から
// `:storage/<ノートのキー>/<ファイル名>` で指す。Windows で書いたものは区切りが \ や %5C になる

const PREFIX = /^\/?:storage(?=[/\\]|%5C)/i

/**
 * `:storage/...` の参照を、attachments/ からの相対パスの区切りごとの配列にする。
 * 添付の参照でなければ null。. や .. などストレージの外を指しうるものも null
 */
export function attachmentPath(ref: string): string[] | null {
  if (!PREFIX.test(ref)) return null
  const rest = ref.replace(PREFIX, '').replace(/%5C/gi, '/').replace(/\\/g, '/')
  // ? や # の後ろはファイル名ではない
  const path = rest.replace(/[?#].*$/, '')
  const parts: string[] = []
  for (const raw of path.split('/')) {
    if (raw === '') continue
    let part: string
    try {
      part = decodeURIComponent(raw)
    } catch {
      return null
    }
    if (part === '.' || part === '..' || part.includes('\0') || /[/\\]/.test(part)) return null
    parts.push(part)
  }
  return parts.length ? parts : null
}

// 表示に使う URL の作り方。blob: の URL はこのサイトのオリジンを持つので、利用者が右クリックから
// 「新しいタブで開く」と、このサイトの中の文書として開ける。SVG や HTML がそこで動くと、ブラウザの中の
// ノートに手が届く。そこで、ファイルの種類を拡張子で決め直す
const RASTER: Record<string, string> = {
  png: 'image/png',
  apng: 'image/apng',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon'
}

export type AttachmentUrlKind =
  /** 画像として出す。タブで開いても画像としてしか表示されない */
  | { kind: 'raster'; type: string }
  /** data: の URL にする。オリジンを持たないので、タブで開いて中のスクリプトが動いてもこのサイトに届かない */
  | { kind: 'svg' }
  /** application/octet-stream にする。タブで開いても表示せず保存になる */
  | { kind: 'binary' }

/** img に出すか（image）、リンクから保存させるか（file）で、URL の作り方を決める */
export function attachmentUrlKind(name: string, purpose: 'image' | 'file'): AttachmentUrlKind {
  if (purpose === 'file') return { kind: 'binary' }
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? ''
  if (ext === 'svg') return { kind: 'svg' }
  // constructor など継承したキーを種類と取り違えない
  return Object.hasOwn(RASTER, ext) ? { kind: 'raster', type: RASTER[ext] } : { kind: 'binary' }
}

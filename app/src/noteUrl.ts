import type { Note } from './types'

// ノートの場所を URL の # に持つ（#/note/<キー>）。キーは .cson のファイル名なので、
// 同じストレージをデスクトップ版と Web 版で開いても同じノートを指す。
// サーバーには送られない部分なので、Vercel の設定も Basic 認証も変わらない

// デスクトップ版（MarkdownPreview の regexIsNoteLink）と同じ。古い 20 文字と uuid の両方
const KEY = '[A-Za-z0-9-]{20,36}'
const HASH = new RegExp(`^#/note/(${KEY})$`)
const LINK = new RegExp(`^:note:(${KEY})$`)

/** URL の # からノートのキーを取る。ノートを指していなければ null */
export function noteKeyFromHash(hash: string): string | null {
  return HASH.exec(hash)?.[1] ?? null
}

export function hashForNote(key: string): string {
  return `#/note/${key}`
}

/** 本文のリンク先が `:note:<キー>` ならそのキー */
export function noteKeyFromLink(href: string): string | null {
  return LINK.exec(href)?.[1] ?? null
}

// 旧 Boostnote のリンク（ストレージキー-ノートキー）。デスクトップ版（regexIsLegacyNoteLink）は # なしの形を開く。
// # を付けて書かれたものも同じノートを指すので開く
const LEGACY = /^#?([A-Za-z0-9]{20})-([A-Za-z0-9]{20})$/

/** `ストレージキー-ノートキー`（# があってもよい）の古いリンクなら、ノートのキー */
export function noteKeyFromLegacyLink(href: string): string | null {
  return LEGACY.exec(href)?.[2] ?? null
}

/** デスクトップ版の「Copy Note Link」と同じ書式。ほかのノートに貼るとそのノートへのリンクになる */
export function noteLink(note: Pick<Note, 'key' | 'title'>): string {
  // 題の ] と \ はリンクの文字を閉じてしまうので逃がす
  return `[${note.title.replace(/[\\[\]]/g, '\\$&')}](:note:${note.key})`
}

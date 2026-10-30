import type { Note, Storage } from '../types'
import { safeName } from './exportMarkdown.ts'

// デスクトップ版の書き出し（browser/main/lib/dataApi/exportNoteAs・exportFolder・
// exportTag・exportStorage）と同じ範囲・形式・ファイル名の付け方にする

export type ExportFormat = 'txt' | 'md' | 'html' | 'pdf'

export type ExportScope =
  | { kind: 'note'; key: string }
  | { kind: 'folder'; storage: string; folder: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'all' }

export interface ExportItem {
  /** zip の中のパス（1 件だけのときはファイル名） */
  path: string
  note: Note
}

/** 範囲に入るノート。ゴミ箱とスニペットは含めない（デスクトップ版と同じ） */
export function notesInScope(notes: Note[], scope: ExportScope): Note[] {
  const live = notes.filter(n => !n.isTrashed && n.type === 'MARKDOWN_NOTE')
  switch (scope.kind) {
    case 'note':
      return live.filter(n => n.key === scope.key)
    case 'folder':
      return live.filter(n => n.storage === scope.storage && n.folder === scope.folder)
    case 'tag':
      return live.filter(n => n.tags.includes(scope.tag))
    case 'all':
      return live
  }
}

/**
 * 書き出すファイルの一覧。同じ名前は「名前 (1).md」のように番号を付ける。
 * すべてを書き出すときはフォルダごとのディレクトリに分ける（ストレージが複数なら、その上にストレージ名）
 */
export function planExport(
  notes: Note[],
  storages: Storage[],
  scope: ExportScope,
  format: Exclude<ExportFormat, 'pdf'>
): ExportItem[] {
  const scoped = notesInScope(notes, scope)
  // 大文字と小文字を区別しない OS（macOS・Windows）でも重ならないように比べる
  const taken = new Set<string>()
  const unique = (dir: string, note: Note) => {
    const base = safeName(note.title)
    const prefix = dir ? `${dir}/` : ''
    for (let n = 0; ; n++) {
      const path = `${prefix}${n ? `${base} (${n})` : base}.${format}`
      if (taken.has(path.toLowerCase())) continue
      taken.add(path.toLowerCase())
      return path
    }
  }
  const dirOf = (note: Note) => {
    // 1 件だけならファイルそのものを渡すので、ディレクトリは付けない
    if (scope.kind !== 'all' || scoped.length === 1) return ''
    const storage = storages.find(s => s.key === note.storage)
    const folder = storage?.folders.find(f => f.key === note.folder)
    const folderDir = safeName(folder?.name ?? note.folder, 'folder')
    return storages.length > 1 ? `${safeName(storage?.name ?? note.storage, 'storage')}/${folderDir}` : folderDir
  }
  return scoped.map(note => ({ path: unique(dirOf(note), note), note }))
}

/** 複数のノートをまとめた zip の名前 */
export function zipName(scope: ExportScope, storages: Storage[], format: ExportFormat, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  if (scope.kind === 'folder') {
    const folder = storages.find(s => s.key === scope.storage)?.folders.find(f => f.key === scope.folder)
    return `${safeName(folder?.name ?? scope.folder, 'folder')}-${format}.zip`
  }
  if (scope.kind === 'tag') return `${safeName(scope.tag, 'tag')}-${format}.zip`
  return `boostrecord-notes-${date}-${format}.zip`
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * 1 つで開ける HTML。スクリプトは入れず、CSP でも読み込みを止める
 * （画像だけは本文が指す先を出せるようにする）
 */
export function htmlDocument(title: string, css: string, body: string): string {
  return [
    '<!doctype html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src * data:; font-src data:">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title || 'untitled')}</title>`,
    // 本文の CSS に </style> が入っていても、ここで閉じないようにする
    `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`,
    '</head>',
    '<body>',
    `<div class="preview">\n${body}\n</div>`,
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

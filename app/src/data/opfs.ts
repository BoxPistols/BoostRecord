// File System Access API が無いブラウザ（Safari / Firefox）向けの保存先。
// OPFS（Origin Private File System）はブラウザの中に閉じた領域で、利用者からは
// ファイルとして見えず、デスクトップ版と同じフォルダも共有できない。
// 中身の出し入れは zip で行う（storageArchive.ts）。
//
// OPFS のルートも FileSystemDirectoryHandle なので、読み書きは
// fileSystemAccess.ts の実装をそのまま使う。ここは「どのフォルダを使うか」と
// zip の出し入れ、ダウンロードだけを持つ。
import type { Note, Storage } from '../types'
import { createFileSystemAccessRepository, type FolderChange } from './fileSystemAccess.ts'
import { exportFilename } from './exportMarkdown.ts'
import {
  exportStorageZip,
  parseStorageZip,
  replaceStorage
} from './storageArchive.ts'

// OPFS の中のストレージのフォルダ名。将来、複数持つときに分けられるようにする
const STORAGE_DIR = 'storage'

const DEFAULT_META = {
  name: 'このブラウザ',
  folders: [{ key: 'default', name: 'ノート', color: '#E10051' }],
  version: '1.0'
}

/**
 * 使えるか。OPFS があっても、メインスレッドから書く createWritable が無い
 * ブラウザでは保存できないので、使えない扱いにする
 */
export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createWritable' in FileSystemFileHandle.prototype
  )
}

/** OPFS の中のストレージを開く。初回は boostnote.json を作る */
export async function openOpfsStorage(
  getRoot: () => Promise<FileSystemDirectoryHandle>
): Promise<FileSystemDirectoryHandle> {
  const root = await getRoot()
  const dir = await root.getDirectoryHandle(STORAGE_DIR, { create: true })
  try {
    await dir.getFileHandle('boostnote.json')
  } catch {
    const handle = await dir.getFileHandle('boostnote.json', { create: true })
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(DEFAULT_META, null, 2))
    await writable.close()
  }
  return dir
}

// デスクトップ版の boostnote.json は name を持たないので、取り込むとフォルダ名
// （STORAGE_DIR）がそのまま出る。利用者に見せる名前に置き換える
function withDisplayName(res: { storages: Storage[]; notes: Note[] }) {
  return {
    notes: res.notes,
    storages: res.storages.map(s =>
      s.name === STORAGE_DIR ? { ...s, name: DEFAULT_META.name } : s
    )
  }
}

const displayed = (change: FolderChange): FolderChange => ({
  ...change,
  storage: withDisplayName({ storages: [change.storage], notes: [] }).storages[0]
})

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // クリック直後に消すと、ダウンロードが始まる前に URL が無効になるブラウザがある
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function archiveFilename(now: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `boostrecord-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}.zip`
}

export interface OpfsRepository {
  load(): Promise<{ storages: Storage[]; notes: Note[] }>
  saveNote(note: Note): Promise<void>
  createNote(opts: { storage?: string; folder?: string }): Promise<Note>
  deleteNote(key: string): Promise<void>
  exportNote(note: Note): Promise<boolean>
  importArchive(file: Blob): Promise<{ storages: Storage[]; notes: Note[] }>
  exportArchive(): Promise<boolean>
  createFolder(storage: string, input: { name: string; color: string }): Promise<FolderChange>
  renameFolder(storage: string, folder: string, name: string): Promise<FolderChange>
}

/**
 * @param getRoot OPFS のルート。テストでは偽のハンドルを渡す
 */
export function createOpfsRepository(
  getRoot: () => Promise<FileSystemDirectoryHandle> = () =>
    navigator.storage.getDirectory()
): OpfsRepository {
  let opened: Promise<{
    dir: FileSystemDirectoryHandle
    inner: ReturnType<typeof createFileSystemAccessRepository>
  }> | null = null

  const open = () => {
    if (!opened) {
      opened = openOpfsStorage(getRoot).then(dir => ({
        dir,
        // OPFS のハンドルは「前回のフォルダ」として覚えない（覚える先は File System Access 用）
        inner: createFileSystemAccessRepository(dir, { rememberHandle: false })
      }))
      // 開けなかったら次の操作で開き直す。失敗を覚えたままだと再読み込みまで保存できない
      opened.catch(() => {
        opened = null
      })
      // ストレージが逼迫したときに消されないよう頼む。断られても使える
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        navigator.storage.persist().catch(() => false)
      }
    }
    return opened
  }

  return {
    async load() {
      try {
        return withDisplayName(await (await open()).inner.load())
      } catch {
        return { storages: [], notes: [] }
      }
    },
    async saveNote(note) {
      return (await open()).inner.saveNote(note)
    },
    async createNote(opts) {
      return (await open()).inner.createNote(opts)
    },
    async deleteNote(key) {
      return (await open()).inner.deleteNote(key)
    },
    async createFolder(storage, input) {
      return displayed(await (await open()).inner.createFolder(storage, input))
    },
    async renameFolder(storage, folder, name) {
      return displayed(await (await open()).inner.renameFolder(storage, folder, name))
    },
    async exportNote(note) {
      // showSaveFilePicker が無いブラウザ向けなので、ダウンロードで渡す
      downloadBlob(
        new Blob([note.content], { type: 'text/markdown' }),
        exportFilename(note)
      )
      return true
    },
    async importArchive(file) {
      const contents = await parseStorageZip(
        new Uint8Array(await file.arrayBuffer())
      )
      const { dir, inner } = await open()
      await replaceStorage(dir, contents)
      // 読み直して、保存時の突き合わせに使う更新日時も取り直す
      return withDisplayName(await inner.load())
    },
    async exportArchive() {
      const { dir } = await open()
      const now = new Date()
      const bytes = await exportStorageZip(dir, now)
      downloadBlob(
        new Blob([bytes], { type: 'application/zip' }),
        archiveFilename(now)
      )
      return true
    }
  }
}

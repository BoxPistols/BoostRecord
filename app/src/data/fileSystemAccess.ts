// File System Access API を使って、ブラウザから直接ローカルの `.cson`
// ストレージを読み書きする。バックエンドは持たない。
//
// ディレクトリの構成は Electron 版と同じ。ストレージのルートに
// `boostnote.json`（フォルダ一覧）があり、`notes/<key>.cson` が並ぶ。
// 解釈と直列化は `./cson.ts`。`cson-parser` は文字列リテラルごとに Node の
// `vm.runInThisContext` を呼ぶので、ブラウザ向けのビルドでは空のスタブに
// 置き換わって読み込んだ瞬間に落ちる。保存は「読んで書き直す」ではなく
// 「その行だけ差し替える」ので、解釈できない値も元のまま残る。
import type { Note, Storage } from '../types'
import { parseNoteCson, stringifyNoteCson, updateNoteCson } from './cson.ts'
import { exportFilename } from './exportMarkdown.ts'

const DB_NAME = 'boostrecord-web'
const DB_VERSION = 1
const STORE = 'handles'
const HANDLE_KEY = 'storage-root'

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
      'function'
  )
}

/* ── ディレクトリハンドルの保存 ─────────────────────────────────────── */
// FileSystemDirectoryHandle は構造化複製できるので IndexedDB にそのまま入る。
// localStorage には入らない（文字列化できない）

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = run(tx.objectStore(STORE))
        // 失敗した時も閉じる。開いたままだと、次に DB_VERSION を上げた時の
        // open が versionchange で止まる
        const close = () => db.close()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        tx.oncomplete = close
        tx.onerror = close
        tx.onabort = close
      })
  )
}

export async function saveStoredHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  // 保存できなくても致命的ではない。次回フォルダを選び直すだけ
  try {
    await withStore('readwrite', store => store.put(handle, HANDLE_KEY))
  } catch {
    /* IndexedDB が使えない環境（プライベートウィンドウ等）では諦める */
  }
}

export async function loadStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await withStore<FileSystemDirectoryHandle | undefined>(
      'readonly',
      store => store.get(HANDLE_KEY)
    )
    return handle || null
  } catch {
    return null
  }
}

export async function clearStoredHandle(): Promise<void> {
  try {
    await withStore('readwrite', store => store.delete(HANDLE_KEY))
  } catch {
    /* 消せなくても実害はない */
  }
}

/* ── 読み書き ───────────────────────────────────────────────────────── */

async function readText(dir: FileSystemDirectoryHandle, name: string) {
  const fileHandle = await dir.getFileHandle(name)
  const file = await fileHandle.getFile()
  return { text: await file.text(), lastModified: file.lastModified }
}

async function writeText(
  dir: FileSystemDirectoryHandle,
  name: string,
  body: string
) {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(body)
  await writable.close()
  const file = await fileHandle.getFile()
  return file.lastModified
}

// 未知のフィールドを残すため、書き戻すのはこの一覧だけ。
// electron/loadNotes.cjs の EDITABLE と同じ
const EDITABLE = [
  'title',
  'content',
  'tags',
  'folder',
  'isStarred',
  'isTrashed',
  'updatedAt'
] as const

type RawNote = Record<string, unknown>

export function toNote(raw: RawNote, key: string, storageKey: string): Note {
  return {
    key,
    type: raw.type === 'SNIPPET_NOTE' ? 'SNIPPET_NOTE' : 'MARKDOWN_NOTE',
    title: typeof raw.title === 'string' ? raw.title : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    tags: Array.isArray(raw.tags)
      ? (raw.tags.filter(t => typeof t === 'string') as string[])
      : [],
    storage: storageKey,
    folder: typeof raw.folder === 'string' ? raw.folder : '',
    isStarred: !!raw.isStarred,
    isTrashed: !!raw.isTrashed,
    createdAt: String(raw.createdAt || ''),
    updatedAt: String(raw.updatedAt || raw.createdAt || '')
  }
}

/** ノートのキーはファイル名。パス片が混ざったものは触らない */
export function isSafeKey(key: string): boolean {
  return !!key && !/[/\\]/.test(key) && !key.includes('..')
}

export interface StorageContents {
  storage: Storage
  notes: Note[]
  /** key -> 読み込んだ時点の mtime。書き込み前の突き合わせに使う */
  mtimes: Map<string, number>
}

export async function readStorage(
  root: FileSystemDirectoryHandle
): Promise<StorageContents> {
  const meta = JSON.parse((await readText(root, 'boostnote.json')).text) as {
    name?: string
    folders?: { key: string; name: string; color?: string }[]
  }
  const key = root.name
  const storage: Storage = {
    key,
    name: meta.name || root.name,
    folders: (meta.folders || []).map(f => ({
      key: f.key,
      name: f.name,
      color: f.color
    }))
  }

  const notes: Note[] = []
  const mtimes = new Map<string, number>()
  let notesDir: FileSystemDirectoryHandle | null = null
  try {
    notesDir = await root.getDirectoryHandle('notes')
  } catch {
    // notes/ がまだ無いストレージ。空として扱う
  }
  if (notesDir) {
    for await (const [name, handle] of notesDir.entries()) {
      if (handle.kind !== 'file' || !name.endsWith('.cson')) continue
      const noteKey = name.replace(/\.cson$/, '')
      try {
        const { text, lastModified } = await readText(notesDir, name)
        const raw = parseNoteCson(text) as RawNote
        // 1 つも読めなかったファイルは、空のノートとして並べるより外す。
        // 書き込み途中のファイルに当たることがある
        if (Object.keys(raw).length === 0) continue
        notes.push(toNote(raw, noteKey, key))
        mtimes.set(noteKey, lastModified)
      } catch {
        // 読み取り自体が失敗しても、ストレージ全体を開けなくはしない
      }
    }
  }
  return { storage, notes, mtimes }
}

/* ── NotesRepository の実装 ─────────────────────────────────────────── */

/** 選んだフォルダがストレージとして使えるか */
async function looksLikeStorage(root: FileSystemDirectoryHandle) {
  try {
    await root.getFileHandle('boostnote.json')
    return true
  } catch {
    return false
  }
}

async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  interactive: boolean
): Promise<boolean> {
  const opts = { mode: 'readwrite' as const }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  // requestPermission はユーザー操作の中でしか通らない。起動直後には呼べない
  if (!interactive) return false
  return (await handle.requestPermission(opts)) === 'granted'
}

export interface FileSystemAccessRepository {
  load(): Promise<{ storages: Storage[]; notes: Note[] }>
  pickStorage(): Promise<{ storages: Storage[]; notes: Note[] } | null>
  saveNote(note: Note): Promise<void>
  createNote(opts: { storage?: string; folder?: string }): Promise<Note>
  deleteNote(key: string): Promise<void>
  exportNote(note: Note): Promise<boolean>
}

/**
 * @param initialRoot すでに手元にあるハンドル。渡すと IndexedDB を見ずに
 *   そのフォルダを使う（テストと、呼び出し側がハンドルを持っている場合）
 */
export function createFileSystemAccessRepository(
  initialRoot?: FileSystemDirectoryHandle
): FileSystemAccessRepository {
  let root: FileSystemDirectoryHandle | null = initialRoot || null
  let mtimes = new Map<string, number>()

  const notesDir = async (create = false) => {
    if (!root) throw new Error('ストレージが開かれていません')
    return root.getDirectoryHandle('notes', { create })
  }

  const adopt = async (handle: FileSystemDirectoryHandle) => {
    const contents = await readStorage(handle)
    root = handle
    mtimes = contents.mtimes
    await saveStoredHandle(handle)
    return { storages: [contents.storage], notes: contents.notes }
  }

  return {
    /**
     * 起動時。前回のフォルダの許可が生きていればそのまま開く。
     * 許可が切れていても、ここでは聞かない（ユーザー操作の外では通らない）。
     * 空を返し、画面の「ストレージを開く」から復帰させる。
     */
    async load() {
      try {
        if (root) return await adopt(root)
        const saved = await loadStoredHandle()
        if (!saved) return { storages: [], notes: [] }
        if (!(await ensurePermission(saved, false))) {
          return { storages: [], notes: [] }
        }
        try {
          return await adopt(saved)
        } catch (e) {
          // フォルダが消えている時だけ忘れる。読み取りが一時的に失敗した
          // だけで覚えたフォルダを捨てると、1 クリックで戻る道が消える
          if (e instanceof DOMException && e.name === 'NotFoundError') {
            await clearStoredHandle()
          }
          return { storages: [], notes: [] }
        }
      } catch {
        // 起動時に投げると、呼び出し側に受け口が無く画面が空のまま止まる
        return { storages: [], notes: [] }
      }
    },

    /**
     * ボタンから呼ばれる。**まず前回のフォルダの許可を求める。**
     * これが「前回のフォルダを開く」の導線で、1 クリックで戻れる。
     * 保存が無い、または断られた時だけフォルダ選択を出す。
     */
    async pickStorage() {
      // **まだ何も開いていない時だけ**、前回のフォルダの許可を求める。
      // これが「前回のフォルダを開く」の導線になる。すでに開いている時に
      // ここを通すと、別のフォルダを選べなくなる
      if (!root) {
        const saved = await loadStoredHandle()
        if (saved && (await ensurePermission(saved, true))) {
          try {
            return await adopt(saved)
          } catch {
            await clearStoredHandle()
          }
        }
      }

      let picked: FileSystemDirectoryHandle
      try {
        picked = await window.showDirectoryPicker({ mode: 'readwrite' })
      } catch {
        return null // 利用者が閉じた
      }
      if (!(await looksLikeStorage(picked))) {
        throw new Error(
          'boostnote.json が見つかりません。Boostnote のストレージフォルダを選んでください。'
        )
      }
      if (!(await ensurePermission(picked, true))) {
        throw new Error('フォルダへの書き込みが許可されませんでした。')
      }
      return adopt(picked)
    },

    async saveNote(note) {
      if (!isSafeKey(note.key)) throw new Error('ノートのキーが不正です')
      const dir = await notesDir()
      const name = `${note.key}.cson`
      const { text, lastModified } = await readText(dir, name)

      // デスクトップ版と同じフォルダを開いている場合に、向こうの変更を
      // 黙って踏み潰さない
      const seen = mtimes.get(note.key)
      if (seen !== undefined && lastModified > seen) {
        throw new Error(
          'このノートは別のアプリから変更されています。読み込み直してください。'
        )
      }

      const updates: Record<string, unknown> = {}
      for (const field of EDITABLE) {
        const value = note[field]
        if (value !== undefined) updates[field] = value
      }
      const written = await writeText(dir, name, updateNoteCson(text, updates))
      mtimes.set(note.key, written)
    },

    async createNote(opts) {
      if (!root) throw new Error('ストレージが開かれていません')
      const dir = await notesDir(true)
      const key = crypto.randomUUID().replace(/-/g, '')
      const now = new Date().toISOString()
      const raw: RawNote = {
        type: 'MARKDOWN_NOTE',
        folder: opts.folder || '',
        title: '',
        content: '',
        tags: [],
        isStarred: false,
        isTrashed: false,
        createdAt: now,
        updatedAt: now
      }
      const written = await writeText(dir, `${key}.cson`, stringifyNoteCson(raw))
      mtimes.set(key, written)
      return toNote(raw, key, root.name)
    },

    async deleteNote(key) {
      if (!isSafeKey(key)) throw new Error('ノートのキーが不正です')
      const dir = await notesDir()
      await dir.removeEntry(`${key}.cson`)
      mtimes.delete(key)
    },

    async exportNote(note) {
      let handle: FileSystemFileHandle
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: exportFilename(note),
          types: [
            {
              description: 'Markdown',
              accept: { 'text/markdown': ['.md'] }
            }
          ]
        })
      } catch (e) {
        // 閉じただけなら false。それ以外は黙って何も起きないのを避ける
        if (e instanceof DOMException && e.name === 'AbortError') return false
        throw e
      }
      const writable = await handle.createWritable()
      await writable.write(note.content)
      await writable.close()
      return true
    }
  }
}

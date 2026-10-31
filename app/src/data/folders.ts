// フォルダの作成と改名。デスクトップ版（browser/main/lib/dataApi/createFolder.js・updateFolder.js、
// browser/lib/folderTree.js）と同じ規則にする。
// フォルダ名は「親/子」のパス表記で階層を表す。親を改名すると子孫も同じ書き込みで付け替え、
// 変更後のパスがほかのフォルダと重なる作成・改名は断る（重なると片方が画面から消える）

const SEPARATOR = '/'

// デスクトップ版の consts.FOLDER_COLORS と同じ 12 色
export const FOLDER_COLORS = [
  '#E10051', '#FF6B35', '#FF8E00', '#E8D252', '#A8C93A', '#3FD941',
  '#30D5C8', '#2BA5F7', '#4C6EF5', '#7C4DFF', '#B013A4', '#8D8D93'
]

export function splitPath(name: unknown): string[] {
  if (typeof name !== 'string') return []
  return name.split(SEPARATOR).map(p => p.trim()).filter(p => p !== '')
}

export const joinPath = (parts: string[]) => parts.join(SEPARATOR)
const normalize = (name: unknown) => joinPath(splitPath(name))

/** boostnote.json の folders の 1 件。知らない項目も書き戻すので残す */
export type RawFolder = { key: string; name: string; color?: string } & Record<string, unknown>

export type FolderError = 'EMPTY_NAME' | 'PATH_CLASH' | 'NOT_FOUND'

export const FOLDER_ERROR_TEXT: Record<FolderError, string> = {
  EMPTY_NAME: 'フォルダの名前を入れてください',
  PATH_CLASH: '同じ名前のフォルダがすでにあります',
  NOT_FOUND: 'フォルダが見つかりません。読み込み直してください'
}

type Result = { ok: true; folders: RawFolder[]; key: string } | { ok: false; error: FolderError }

/** デスクトップ版の keygen() と同じ 20 桁の 16 進 */
export function folderKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export function createFolder(folders: RawFolder[], input: { name: string; color: string }, newKey = folderKey): Result {
  const name = normalize(input.name)
  if (!name) return { ok: false, error: 'EMPTY_NAME' }
  if (folders.some(f => normalize(f.name) === name)) return { ok: false, error: 'PATH_CLASH' }
  let key = newKey()
  while (folders.some(f => f.key === key)) key = newKey()
  return { ok: true, key, folders: [...folders, { key, color: input.color, name }] }
}

export function renameFolder(folders: RawFolder[], key: string, newName: string): Result {
  const target = folders.find(f => f.key === key)
  if (!target) return { ok: false, error: 'NOT_FOUND' }
  const oldPath = normalize(target.name)
  const newPath = normalize(newName)
  if (!newPath) return { ok: false, error: 'EMPTY_NAME' }

  const changes = new Map([[key, newPath]])
  if (oldPath && newPath !== oldPath) {
    for (const f of folders) {
      const p = normalize(f.name)
      // 厳密な子孫だけ。同じパスの別フォルダは巻き込まない
      if (f.key !== key && p.startsWith(oldPath + SEPARATOR)) changes.set(f.key, newPath + p.slice(oldPath.length))
    }
  }
  // 変更後のパスが、変更していないフォルダと重ならないか
  const seen = new Map<string, string>()
  for (const f of folders) {
    const p = changes.get(f.key) ?? normalize(f.name)
    const other = seen.get(p)
    if (other !== undefined && (changes.has(f.key) || changes.has(other))) return { ok: false, error: 'PATH_CLASH' }
    if (other === undefined) seen.set(p, f.key)
  }
  return { ok: true, key, folders: folders.map(f => (changes.has(f.key) ? { ...f, name: changes.get(f.key)! } : f)) }
}

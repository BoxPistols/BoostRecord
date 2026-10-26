// ストレージ（boostnote.json と notes/*.cson）を zip で出し入れする。
// OPFS（ブラウザの中に閉じた保存領域）に入れたノートを外へ出す口であり、
// デスクトップ版のストレージフォルダを zip にしたものを取り込む口でもある。
//
// 添付（attachments/）は扱わない。Web 版はまだ添付を表示も保存もしないので、
// 取り込んでも使い道が無く、書き出しにも含められない。
import { createZip, readZip } from './zip.ts'
import { isSafeKey } from './fileSystemAccess.ts'

// 書き出す zip の中のフォルダ名。展開するとそのままデスクトップ版のストレージになる
export const ARCHIVE_ROOT = 'BoostRecord'

const NOTE_PATTERN = /^notes\/([^/]+)\.cson$/

async function readFileText(dir: FileSystemDirectoryHandle, name: string) {
  const handle = await dir.getFileHandle(name)
  return (await handle.getFile()).text()
}

async function writeFileText(
  dir: FileSystemDirectoryHandle,
  name: string,
  body: string
) {
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(body)
  await writable.close()
}

/** ストレージを zip にする */
export async function exportStorageZip(
  root: FileSystemDirectoryHandle,
  now = new Date()
): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder()
  const entries = [
    {
      path: `${ARCHIVE_ROOT}/boostnote.json`,
      data: encoder.encode(await readFileText(root, 'boostnote.json'))
    }
  ]
  let notesDir: FileSystemDirectoryHandle | null = null
  try {
    notesDir = await root.getDirectoryHandle('notes')
  } catch {
    // ノートがまだ1つも無い
  }
  if (notesDir) {
    const names: string[] = []
    for await (const [name, handle] of notesDir.entries()) {
      if (handle.kind === 'file' && name.endsWith('.cson')) names.push(name)
    }
    // 並びを決めておく（同じ中身なら同じ zip になる）
    names.sort()
    for (const name of names) {
      entries.push({
        path: `${ARCHIVE_ROOT}/notes/${name}`,
        data: encoder.encode(await readFileText(notesDir, name))
      })
    }
  }
  return createZip(entries, now)
}

export interface ArchiveContents {
  meta: string
  notes: { key: string; text: string }[]
}

/**
 * zip からストレージの中身を取り出す。まだ何も書き込まない。
 * boostnote.json はいちばん浅いものを使い、その隣の notes/ だけを読む。
 * フォルダごと zip にしたもの（Boostnote/boostnote.json）も、中身だけを zip にしたもの
 * （boostnote.json）も受ける
 */
export async function parseStorageZip(bytes: Uint8Array): Promise<ArchiveContents> {
  // macOS の圧縮で入る __MACOSX/ と ._ のファイルは中身ではない
  const relevant = (path: string) =>
    !path.startsWith('__MACOSX/') &&
    !/(^|\/)\._/.test(path) &&
    (/(^|\/)boostnote\.json$/.test(path) || /(^|\/)notes\/[^/]+\.cson$/.test(path))
  const entries = await readZip(bytes, { filter: relevant })

  const metas = entries
    .filter(e => /(^|\/)boostnote\.json$/.test(e.path))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length)
  if (metas.length === 0) {
    throw new Error(
      'zip の中に boostnote.json が見つかりません。ストレージフォルダを zip にしたものを選んでください。'
    )
  }
  const prefix = metas[0].path.slice(0, -'boostnote.json'.length)
  const decoder = new TextDecoder()
  const meta = decoder.decode(metas[0].data)
  try {
    JSON.parse(meta)
  } catch {
    throw new Error('boostnote.json を読めませんでした')
  }

  const notes: ArchiveContents['notes'] = []
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix)) continue
    const m = NOTE_PATTERN.exec(entry.path.slice(prefix.length))
    // ファイル名がそのままノートのキーになる。パス片を含むものは書き込まない
    if (!m || !isSafeKey(m[1])) continue
    notes.push({ key: m[1], text: decoder.decode(entry.data) })
  }
  return { meta, notes }
}

/**
 * 取り出した中身でストレージを**置き換える**。今あるノートは消える。
 * 呼ぶ前に、利用者に確認すること
 */
export async function replaceStorage(
  root: FileSystemDirectoryHandle,
  contents: ArchiveContents
): Promise<void> {
  try {
    await root.removeEntry('notes', { recursive: true })
  } catch (e) {
    // notes/ がまだ無いときだけ進める。消し損ねたまま書くと古いノートが混ざる
    if ((e as { name?: string } | null)?.name !== 'NotFoundError') throw e
  }
  await writeFileText(root, 'boostnote.json', contents.meta)
  const notesDir = await root.getDirectoryHandle('notes', { create: true })
  for (const note of contents.notes) {
    await writeFileText(notesDir, `${note.key}.cson`, note.text)
  }
}

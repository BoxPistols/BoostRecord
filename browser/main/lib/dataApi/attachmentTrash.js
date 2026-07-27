/**
 * @fileoverview 添付画像のソフトデリート（30日ゴミ箱）。
 *
 * 添付の物理削除は3経路（エディタの自動削除 / 画像マネージャ / 環境設定の
 * ストレージタブ）にあり、いずれも「ノート本文から参照されていない＝未使用」
 * という判定に依存する。この判定はパーサの取りこぼし1つで正常なファイルを
 * orphan と誤認するため、削除は復元可能でなければならない。
 *
 * 保管場所は `<storagePath>/.attachment-trash/`（`attachments/` の兄弟）。
 * - storage 相対なのでフォルダ移動・クラウド同期後も復元が成立する
 * - `attachments/` の中に置くと listAttachments が noteKey ディレクトリとして
 *   列挙し、ゴミ箱の中身が「未使用」として再び削除対象になるため兄弟に置く
 *
 * エントリは「実体ファイル + 同名の sidecar JSON」の2点セットで保持する。
 * 単一の index ファイルにしないのは、書き込み競合やクラッシュでゴミ箱全体の
 * 復元情報を一度に失うことを避けるため。
 */
const fs = require('fs')
const path = require('path')

const TRASH_FOLDER = '.attachment-trash'
const META_SUFFIX = '.trashmeta.json'
const META_VERSION = 1
const TRASH_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
// attachmentManagement.DESTINATION_FOLDER と同値。循環 import を避けるため再定義
const ATTACHMENTS_FOLDER = 'attachments'

// 復元名に使える文字。ノート本文の参照パーサが解釈できる範囲に限定する
const SAFE_NAME = /^[\w.-]+$/

let sequence = 0

function stillExists(p) {
  try {
    fs.statSync(p)
    return true
  } catch (e) {
    return false
  }
}

/**
 * 添付の絶対パス `<root>/attachments/<noteKey>/<file>` を分解する。
 * 形が違うパスは（想定外の場所を消しに行かないよう）null を返す。
 */
function locate(absPath) {
  if (typeof absPath !== 'string' || absPath === '') return null
  const noteDir = path.dirname(absPath)
  const attachmentsDir = path.dirname(noteDir)
  if (path.basename(attachmentsDir) !== ATTACHMENTS_FOLDER) return null
  return {
    storagePath: path.dirname(attachmentsDir),
    noteKey: path.basename(noteDir),
    fileName: path.basename(absPath)
  }
}

function trashDirOf(storagePath) {
  return path.join(storagePath, TRASH_FOLDER)
}

// ゴミ箱内の一意な名前。sidecar が実体を持つので可読性より衝突回避を優先する
function uniqueTrashName(fileName) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  sequence += 1
  const salt =
    sequence +
    Math.random()
      .toString(36)
      .slice(2, 8)
  return stamp + '__' + salt + '__' + fileName
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (e) {
    /* 既存なら無視。失敗は後続の書き込みで検出される */
  }
}

// 同一ボリューム内の移動なので rename で足りるが、EXDEV 等では copy+unlink に落とす
function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest)
    return
  } catch (e) {
    fs.copyFileSync(src, dest)
    fs.unlinkSync(src)
  }
}

/**
 * 添付ファイルをゴミ箱へ移動する（物理削除しない）。
 * @param {string[]} absPaths 添付の絶対パス
 * @returns {Promise<{trashed: string[], failed: Array<{path: string, reason: string}>}>}
 */
function trashAttachments(absPaths) {
  const trashed = []
  const failed = []

  ;(absPaths || []).forEach(absPath => {
    const loc = locate(absPath)
    if (!loc) {
      failed.push({ path: absPath, reason: 'not an attachment path' })
      return
    }
    // 既に無いものは「消えている」で成功扱い（deleteAttachmentsVerified と同じ方針）
    if (!stillExists(absPath)) {
      trashed.push(absPath)
      return
    }
    const dir = trashDirOf(loc.storagePath)
    ensureDir(dir)
    const trashName = uniqueTrashName(loc.fileName)
    const destPath = path.join(dir, trashName)
    try {
      moveFile(absPath, destPath)
    } catch (e) {
      failed.push({
        path: absPath,
        reason: String(e && e.message ? e.message : e)
      })
      return
    }
    // sidecar は移動後に書く。先に書くと移動失敗時に迷子のメタが残る
    try {
      fs.writeFileSync(
        path.join(dir, trashName + META_SUFFIX),
        JSON.stringify(
          {
            version: META_VERSION,
            fileName: loc.fileName,
            noteKey: loc.noteKey,
            originalPath: absPath,
            deletedAt: new Date().toISOString()
          },
          null,
          2
        )
      )
    } catch (e) {
      /* sidecar が書けなくてもファイル自体は保全されている。purge は
         メタ不明を消さない（fail-closed）ので、残り続ける方に倒れる */
    }
    trashed.push(absPath)
  })

  return Promise.resolve({ trashed, failed })
}

function normalizeStorage(raw) {
  if (!raw || !raw.path) return null
  return { key: raw.key, name: raw.name || raw.key, path: raw.path }
}

function readMeta(metaPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch (e) {
    return null
  }
}

/**
 * 各ストレージのゴミ箱の中身を列挙する（読み取りのみ）。
 * sidecar が読めないエントリも `meta: null` で返す（purge 対象外だが可視化はする）。
 * @param {Array<Object>} storageList state.data.storageMap.toJS() の値
 * @returns {Promise<Array<Object>>}
 */
function listTrashedAttachments(storageList) {
  const now = Date.now()
  const result = []

  ;(storageList || []).forEach(raw => {
    const storage = normalizeStorage(raw)
    if (!storage) return
    const dir = trashDirOf(storage.path)
    let names
    try {
      names = fs.readdirSync(dir)
    } catch (e) {
      return
    }
    names.forEach(name => {
      if (name.endsWith(META_SUFFIX)) return
      const trashPath = path.join(dir, name)
      let size = 0
      try {
        const st = fs.statSync(trashPath)
        if (!st.isFile()) return
        size = st.size
      } catch (e) {
        return
      }
      const metaPath = trashPath + META_SUFFIX
      const meta = readMeta(metaPath)
      const deletedAt = meta && meta.deletedAt ? meta.deletedAt : null
      const deletedMs = deletedAt ? Date.parse(deletedAt) : NaN
      const hasAge = !isNaN(deletedMs)
      result.push({
        storageKey: storage.key,
        storageName: storage.name,
        storagePath: storage.path,
        trashName: name,
        trashPath,
        metaPath,
        fileName: meta && meta.fileName ? meta.fileName : name,
        noteKey: meta && meta.noteKey ? meta.noteKey : null,
        originalPath: meta && meta.originalPath ? meta.originalPath : null,
        deletedAt,
        size,
        // メタ不明は年齢不明。復元は可能だが自動 purge の対象にはしない
        daysLeft: hasAge
          ? Math.max(
              0,
              Math.ceil(
                (deletedMs + TRASH_RETENTION_DAYS * DAY_MS - now) / DAY_MS
              )
            )
          : null,
        expired: hasAge
          ? now - deletedMs >= TRASH_RETENTION_DAYS * DAY_MS
          : false,
        restorable: !!(meta && meta.noteKey && meta.fileName)
      })
    })
  })

  result.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)))
  return Promise.resolve(result)
}

// 復元先が埋まっている場合の代替名。参照パーサが読める文字だけを使う
function collisionFreePath(dir, fileName) {
  let target = path.join(dir, fileName)
  if (!stillExists(target)) return target
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  for (let i = 1; i < 1000; i++) {
    const candidate = base + '-restored-' + i + ext
    target = path.join(dir, candidate)
    if (!stillExists(target)) return target
  }
  return null
}

/**
 * ゴミ箱のエントリを元の添付フォルダへ戻す。
 * 参照が無いから削除されたファイルなので、ノート本文の書き換えは不要。
 * @param {Array<Object>} entries listTrashedAttachments が返したエントリ
 * @returns {Promise<{restored: Array<Object>, failed: Array<{path: string, reason: string}>}>}
 */
function restoreTrashedAttachments(entries) {
  const restored = []
  const failed = []

  ;(entries || []).forEach(entry => {
    if (!entry || !entry.trashPath) return
    if (!entry.noteKey || !entry.fileName) {
      failed.push({ path: entry.trashPath, reason: 'metadata missing' })
      return
    }
    if (!SAFE_NAME.test(entry.fileName)) {
      failed.push({ path: entry.trashPath, reason: 'unsafe file name' })
      return
    }
    const storagePath =
      entry.storagePath ||
      (entry.originalPath
        ? path.dirname(path.dirname(path.dirname(entry.originalPath)))
        : null)
    if (!storagePath) {
      failed.push({ path: entry.trashPath, reason: 'storage path unknown' })
      return
    }
    const destDir = path.join(storagePath, ATTACHMENTS_FOLDER, entry.noteKey)
    ensureDir(destDir)
    const destPath = collisionFreePath(destDir, entry.fileName)
    if (!destPath) {
      failed.push({ path: entry.trashPath, reason: 'no free file name' })
      return
    }
    try {
      moveFile(entry.trashPath, destPath)
    } catch (e) {
      failed.push({
        path: entry.trashPath,
        reason: String(e && e.message ? e.message : e)
      })
      return
    }
    try {
      fs.unlinkSync(entry.metaPath)
    } catch (e) {
      /* sidecar だけ残っても listTrashedAttachments は実体基準なので無害 */
    }
    restored.push({
      fileName: entry.fileName,
      noteKey: entry.noteKey,
      restoredPath: destPath,
      renamed: path.basename(destPath) !== entry.fileName
    })
  })

  return Promise.resolve({ restored, failed })
}

// 実体と sidecar を消し、実体が本当に消えたか検証する
function purgeOne(entry, deleted, failed) {
  try {
    fs.unlinkSync(entry.trashPath)
  } catch (e) {
    /* 既に無い可能性があるので検証側で判定する */
  }
  if (stillExists(entry.trashPath)) {
    failed.push({
      path: entry.trashPath,
      reason: 'file still present after delete'
    })
    return
  }
  try {
    fs.unlinkSync(entry.metaPath)
  } catch (e) {
    /* best-effort */
  }
  deleted.push(entry.trashPath)
}

/**
 * 指定エントリを完全削除する（ゴミ箱を空にする / 個別の完全削除）。
 * @returns {Promise<{deleted: string[], failed: Array<{path: string, reason: string}>}>}
 */
function purgeTrashedAttachments(entries) {
  const deleted = []
  const failed = []
  ;(entries || []).forEach(entry => {
    if (!entry || !entry.trashPath) return
    purgeOne(entry, deleted, failed)
  })
  return Promise.resolve({ deleted, failed })
}

/**
 * 保持期間（30日）を過ぎたエントリだけを完全削除する。
 * 削除日時が読めないエントリは「年齢不明」であって「期限切れ」ではないため
 * 消さない（fail-closed）。
 */
function purgeExpiredTrash(storageList) {
  return listTrashedAttachments(storageList).then(entries =>
    purgeTrashedAttachments(entries.filter(e => e.expired))
  )
}

export default {
  trashAttachments,
  listTrashedAttachments,
  restoreTrashedAttachments,
  purgeTrashedAttachments,
  purgeExpiredTrash,
  TRASH_FOLDER,
  TRASH_RETENTION_DAYS,
  META_SUFFIX
}

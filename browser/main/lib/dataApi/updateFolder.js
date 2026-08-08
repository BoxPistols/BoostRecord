const _ = require('lodash')
const path = require('path')
const resolveStorageData = require('./resolveStorageData')
const CSON = require('@rokt33r/season')
const { findStorage } = require('browser/lib/findStorage')
const {
  splitPath,
  joinPath,
  renameFolderPaths
} = require('browser/lib/folderTree')

/**
 * @param {String} storageKey
 * @param {String} folderKey
 * @param {Object} input
 * ```
 * {
 *   color: String,   // 省略可（省略時は現在の色を保つ）
 *   name: String
 * }
 * ```
 *
 * パス表記のネストでは、親の name を変えると子孫も同じ接頭辞を持ち続ける。
 * 子孫のパスも同じ書き込みでまとめて付け替える（親だけ改名すると子孫が
 * 旧パスの下へ取り残され、旧名の中間ノードが復活して階層が割れる）。
 *
 * @return {Object}
 * ```
 * {
 *   storage: Object
 * }
 * ```
 */
function updateFolder(storageKey, folderKey, input) {
  let targetStorage
  try {
    if (input == null) throw new Error('No input found.')
    if (!_.isString(input.name)) throw new Error('Name must be a string.')
    if (splitPath(input.name).length === 0) {
      throw new Error('Name must contain at least one path segment.')
    }

    targetStorage = findStorage(storageKey)
  } catch (e) {
    return Promise.reject(e)
  }

  return resolveStorageData(targetStorage).then(function updateFolder(storage) {
    const targetFolder = _.find(storage.folders, { key: folderKey })
    if (targetFolder == null) throw new Error("Target folder doesn't exist.")
    // 保存値は正規化した一意表記へ。自分・子孫の変更後パスが他と衝突する
    // 改名は拒否する（通せばツリー導出の先勝ちでどちらかが画面から消える）
    const renamed = renameFolderPaths(storage.folders, folderKey, input.name)
    if (!renamed.ok) {
      if (renamed.error === 'PATH_CLASH') {
        throw new Error('A folder with the same path already exists.')
      }
      throw new Error('Name must contain at least one path segment.')
    }
    renamed.changes.forEach(change => {
      const folder = _.find(storage.folders, { key: change.key })
      if (folder) folder.name = change.name
    })
    // no-op の改名でも正規化だけは反映する（旧データの ' a / b ' 等を
    // 保存し直す機会になる）
    targetFolder.name = joinPath(splitPath(input.name))
    if (_.isString(input.color)) targetFolder.color = input.color

    // boostnote.json が読めなかったストレージへは書き戻さない。
    // 空の folders を永続化すると全フォルダレコードが失われる
    if (storage.foldersUnreadable) {
      throw new Error(
        'boostnote.json could not be read; refusing to overwrite it'
      )
    }
    CSON.writeFileSync(
      path.join(storage.path, 'boostnote.json'),
      _.pick(storage, ['folders', 'version'])
    )

    return {
      storage
    }
  })
}

module.exports = updateFolder

const _ = require('lodash')
const keygen = require('browser/lib/keygen')
const path = require('path')
const resolveStorageData = require('./resolveStorageData')
const CSON = require('@rokt33r/season')
const { findStorage } = require('browser/lib/findStorage')
const { splitPath, joinPath } = require('browser/lib/folderTree')

/**
 * @param {String} storageKey
 * @param {Object} input
 * ```
 * {
 *   color: String,
 *   name: String
 * }
 * ```
 *
 * @return {Object}
 * ```
 * {
 *   storage: Object
 * }
 * ```
 */
function createFolder(storageKey, input) {
  let targetStorage
  try {
    if (input == null) throw new Error('No input found.')
    if (!_.isString(input.name)) throw new Error('Name must be a string.')
    if (!_.isString(input.color)) throw new Error('Color must be a string.')
    // フォルダ名はパス表記で階層を表す。正規化して空になる名前
    // （'/' '///' ' / '）は、祖先に指定された時に「全パスがその子孫」に
    // なりうるので入口で弾く。UI 側の trim().length > 0 は素通りする
    if (splitPath(input.name).length === 0) {
      throw new Error('Name must contain at least one path segment.')
    }

    targetStorage = findStorage(storageKey)
  } catch (e) {
    return Promise.reject(e)
  }

  return resolveStorageData(targetStorage).then(function createFolder(storage) {
    let key = keygen()
    while (storage.folders.some(folder => folder.key === key)) {
      key = keygen()
    }
    // 保存値は正規化した一意表記に揃える。'A/B' と ' A / B ' が両方保存できると
    // ツリー導出が先勝ちで片方を落とし、そのフォルダが画面から消える
    const normalized = joinPath(splitPath(input.name))
    if (storage.folders.some(f => joinPath(splitPath(f.name)) === normalized)) {
      throw new Error('A folder with the same path already exists.')
    }
    const newFolder = {
      key,
      color: input.color,
      name: normalized
    }

    storage.folders.push(newFolder)

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

module.exports = createFolder

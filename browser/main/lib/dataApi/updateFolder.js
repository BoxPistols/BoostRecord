const _ = require('lodash')
const path = require('path')
const resolveStorageData = require('./resolveStorageData')
const CSON = require('@rokt33r/season')
const { findStorage } = require('browser/lib/findStorage')
const { splitPath, joinPath } = require('browser/lib/folderTree')

/**
 * @param {String} storageKey
 * @param {String} folderKey
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
function updateFolder(storageKey, folderKey, input) {
  let targetStorage
  try {
    if (input == null) throw new Error('No input found.')
    if (!_.isString(input.name)) throw new Error('Name must be a string.')
    if (!_.isString(input.color)) throw new Error('Color must be a string.')
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
    // 保存値は正規化した一意表記へ。自分以外に同じパスがあれば拒否する
    // （通せばツリー導出の先勝ちでどちらかが画面から消える）
    const normalized = joinPath(splitPath(input.name))
    const clash = storage.folders.some(
      f => f.key !== folderKey && joinPath(splitPath(f.name)) === normalized
    )
    if (clash) throw new Error('A folder with the same path already exists.')
    targetFolder.name = normalized
    targetFolder.color = input.color

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

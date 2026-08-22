'use strict'

/**
 * The Boosters -> BoostRecord 改名にともなう userData ディレクトリの移行。
 *
 * Electron は package.json の productName から userData のパスを決めるため、
 * 改名すると保存先が変わり、既存ユーザーからは以下が失われたように見える。
 *
 *   - ai-keys.json      AI プロバイダの API キー（暗号化保存）
 *   - snippets.json     スニペット
 *   - media-backups/    添付ファイルのバックアップ
 *   - config.json       electron-config が持つ設定（ストレージパス・ホットキー等）
 *
 * ノート本体（.cson）はユーザー指定のストレージパスに保存されるため影響を受けない。
 *
 * この処理は旧ディレクトリから新ディレクトリへ「コピー」する。移動ではないので、
 * 問題があれば旧ディレクトリはそのまま残っており復旧できる。
 * 一度成功するとマーカーファイルを書き、以降は何もしない。
 *
 * 参照: docs/RENAME-2026-BoostRecord.md
 */

const fs = require('fs')
const path = require('path')

/** 過去に使われた productName / name。新しい順ではなく、確度の高い順に並べる。 */
const LEGACY_APP_NAMES = ['The Boosters', 'the-boosters']

/** 移行完了を記録するファイル名。 */
const MARKER_FILENAME = '.userdata-migrated'

/**
 * コピー対象から除外するトップレベルのエントリ。
 *
 * - boostnote.service は node-ipc が作る Unix ドメインソケット。
 *   古いソケットを持ち込むと接続先が死んでいる状態になる。プラットフォームに
 *   よっては cpSync 自体が ENOTSUP で失敗する。
 * - Singleton* は Electron/Chromium の多重起動防止用のロックとソケット。
 * - 各種 Cache は再生成される。サイズが大きく、コピーする意味がない。
 */
const SKIP_ENTRIES = new Set([
  MARKER_FILENAME,
  'boostnote.service',
  'SingletonLock',
  'SingletonSocket',
  'SingletonCookie',
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'Crashpad',
  'blob_storage',
  'component_crx_cache'
])

/**
 * 旧 userData ディレクトリを新 userData ディレクトリへコピーする。
 *
 * @param {object}   options
 * @param {string}   options.currentDir   現在の userData ディレクトリ（絶対パス）
 * @param {string[]} [options.legacyNames] 探索する旧アプリ名
 * @param {object}   [options.logger]      console 互換のロガー
 * @returns {{migrated: boolean, reason: string, from?: string, to?: string, error?: Error}}
 */
function migrateUserData(options) {
  const currentDir = options && options.currentDir
  const legacyNames =
    (options && options.legacyNames) || LEGACY_APP_NAMES
  const logger = (options && options.logger) || console

  if (!currentDir) {
    return { migrated: false, reason: 'no-current-dir' }
  }

  const markerPath = path.join(currentDir, MARKER_FILENAME)
  if (fs.existsSync(markerPath)) {
    return { migrated: false, reason: 'already-migrated' }
  }

  const parentDir = path.dirname(currentDir)

  for (const legacyName of legacyNames) {
    const legacyDir = path.join(parentDir, legacyName)

    // 改名前は legacyDir === currentDir になる。自己コピーを避ける。
    if (path.resolve(legacyDir) === path.resolve(currentDir)) {
      continue
    }

    let legacyStat = null
    try {
      legacyStat = fs.statSync(legacyDir)
    } catch (err) {
      continue
    }
    if (!legacyStat.isDirectory()) {
      continue
    }

    try {
      fs.mkdirSync(currentDir, { recursive: true })
      fs.cpSync(legacyDir, currentDir, {
        recursive: true,
        // 移行先に既にあるファイルは上書きしない。新しい側を常に優先する。
        force: false,
        errorOnExist: false,
        filter: src => !isSkipped(legacyDir, src)
      })
      fs.writeFileSync(
        markerPath,
        JSON.stringify({ from: legacyDir, migratedAt: new Date().toISOString() }, null, 2)
      )
      logger.log(
        '[userdata-migration] copied ' + legacyDir + ' -> ' + currentDir
      )
      return {
        migrated: true,
        reason: 'copied',
        from: legacyDir,
        to: currentDir
      }
    } catch (err) {
      // 移行の失敗でアプリの起動を止めない。旧ディレクトリは無傷のまま残る。
      logger.error(
        '[userdata-migration] failed to copy ' +
          legacyDir +
          ': ' +
          (err && err.message)
      )
      return { migrated: false, reason: 'copy-failed', error: err }
    }
  }

  return { migrated: false, reason: 'no-legacy-dir' }
}

/**
 * コピー元パスが除外対象かどうか。トップレベルのエントリ名だけで判定する。
 */
function isSkipped(rootDir, srcPath) {
  const relative = path.relative(rootDir, srcPath)
  if (!relative) {
    return false
  }
  const topLevel = relative.split(path.sep)[0]
  return SKIP_ENTRIES.has(topLevel)
}

/**
 * Electron の app から userData を取得して移行を実行する薄いラッパー。
 * main プロセスから、userData に触れるモジュールを require する前に呼ぶこと。
 */
function migrateUserDataFromElectron(logger) {
  const { app } = require('electron')
  return migrateUserData({
    currentDir: app.getPath('userData'),
    logger: logger || console
  })
}

module.exports = {
  migrateUserData,
  migrateUserDataFromElectron,
  isSkipped,
  LEGACY_APP_NAMES,
  MARKER_FILENAME,
  SKIP_ENTRIES
}

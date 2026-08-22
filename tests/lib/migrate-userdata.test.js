/**
 * The Boosters -> BoostRecord 改名にともなう userData 移行の検証。
 *
 * 実際の userData には触らず、os.tmpdir() 配下に親ディレクトリを作って
 * 「旧アプリ名 / 新アプリ名」の2ディレクトリを並べた状況を再現する。
 *
 * 参照: docs/RENAME-2026-BoostRecord.md
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  migrateUserData,
  MARKER_FILENAME
} = require('../../lib/migrate-userdata')

const LEGACY_NAME = 'The Boosters'
const CURRENT_NAME = 'BoostRecord'

let parentDir
let legacyDir
let currentDir
const silentLogger = { log: () => {}, error: () => {} }

beforeEach(() => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'userdata-migration-'))
  legacyDir = path.join(parentDir, LEGACY_NAME)
  currentDir = path.join(parentDir, CURRENT_NAME)
})

afterEach(() => {
  fs.rmSync(parentDir, { recursive: true, force: true })
})

function run(overrides) {
  return migrateUserData(
    Object.assign(
      {
        currentDir,
        legacyNames: [LEGACY_NAME],
        logger: silentLogger
      },
      overrides
    )
  )
}

it('旧ディレクトリが無ければ何もしない', () => {
  const result = run()
  expect(result.migrated).toBe(false)
  expect(result.reason).toBe('no-legacy-dir')
  expect(fs.existsSync(currentDir)).toBe(false)
})

it('旧ディレクトリの中身を新ディレクトリへコピーする', () => {
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.writeFileSync(path.join(legacyDir, 'ai-keys.json'), '{"v":1}')
  fs.writeFileSync(path.join(legacyDir, 'snippets.json'), '[]')
  fs.mkdirSync(path.join(legacyDir, 'media-backups', '2026-01-01'), {
    recursive: true
  })
  fs.writeFileSync(
    path.join(legacyDir, 'media-backups', '2026-01-01', 'a.png'),
    'png'
  )

  const result = run()

  expect(result.migrated).toBe(true)
  expect(fs.readFileSync(path.join(currentDir, 'ai-keys.json'), 'utf8')).toBe(
    '{"v":1}'
  )
  expect(fs.readFileSync(path.join(currentDir, 'snippets.json'), 'utf8')).toBe(
    '[]'
  )
  expect(
    fs.readFileSync(
      path.join(currentDir, 'media-backups', '2026-01-01', 'a.png'),
      'utf8'
    )
  ).toBe('png')
})

it('コピー後にマーカーを書き、2回目は何もしない', () => {
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.writeFileSync(path.join(legacyDir, 'config.json'), '{}')

  expect(run().migrated).toBe(true)
  expect(fs.existsSync(path.join(currentDir, MARKER_FILENAME))).toBe(true)

  // 2回目の呼び出しでは旧ディレクトリを読まない
  fs.writeFileSync(path.join(legacyDir, 'config.json'), '{"changed":true}')
  const second = run()

  expect(second.migrated).toBe(false)
  expect(second.reason).toBe('already-migrated')
  expect(fs.readFileSync(path.join(currentDir, 'config.json'), 'utf8')).toBe(
    '{}'
  )
})

it('移行先に既にあるファイルは上書きしない', () => {
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.writeFileSync(path.join(legacyDir, 'config.json'), '{"from":"legacy"}')
  fs.mkdirSync(currentDir, { recursive: true })
  fs.writeFileSync(path.join(currentDir, 'config.json'), '{"from":"current"}')

  expect(run().migrated).toBe(true)
  expect(fs.readFileSync(path.join(currentDir, 'config.json'), 'utf8')).toBe(
    '{"from":"current"}'
  )
})

it('ソケットやキャッシュなどの実行時ファイルはコピーしない', () => {
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.writeFileSync(path.join(legacyDir, 'boostnote.service'), 'stale-socket')
  fs.writeFileSync(path.join(legacyDir, 'SingletonLock'), 'lock')
  fs.mkdirSync(path.join(legacyDir, 'Cache'), { recursive: true })
  fs.writeFileSync(path.join(legacyDir, 'Cache', 'blob'), 'x')
  fs.writeFileSync(path.join(legacyDir, 'snippets.json'), '[]')

  expect(run().migrated).toBe(true)

  expect(fs.existsSync(path.join(currentDir, 'snippets.json'))).toBe(true)
  expect(fs.existsSync(path.join(currentDir, 'boostnote.service'))).toBe(false)
  expect(fs.existsSync(path.join(currentDir, 'SingletonLock'))).toBe(false)
  expect(fs.existsSync(path.join(currentDir, 'Cache'))).toBe(false)
})

it('改名前（旧名と現在名が同一）は自己コピーせず何もしない', () => {
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.writeFileSync(path.join(legacyDir, 'config.json'), '{}')

  const result = migrateUserData({
    currentDir: legacyDir,
    legacyNames: [LEGACY_NAME],
    logger: silentLogger
  })

  expect(result.migrated).toBe(false)
  expect(result.reason).toBe('no-legacy-dir')
  expect(fs.existsSync(path.join(legacyDir, MARKER_FILENAME))).toBe(false)
})

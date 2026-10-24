/**
 * Version comparison used by the GitHub release update check
 * (lib/main-app.js). The old electron-gh-releases updater pointed at the
 * dead upstream repo — these tests pin the replacement's decision logic.
 */
const {
  isNewerVersion,
  pickDownloadUrl,
  hostArch
} = require('../../lib/update-check')

it('detects a newer patch / minor / major version', () => {
  expect(isNewerVersion('0.16.3', '0.16.2')).toBe(true)
  expect(isNewerVersion('0.17.0', '0.16.2')).toBe(true)
  expect(isNewerVersion('1.0.0', '0.16.2')).toBe(true)
})

it('returns false for the same or an older version', () => {
  expect(isNewerVersion('0.16.2', '0.16.2')).toBe(false)
  expect(isNewerVersion('0.16.1', '0.16.2')).toBe(false)
  expect(isNewerVersion('0.9.9', '0.16.2')).toBe(false)
})

it('compares numerically, not lexicographically', () => {
  expect(isNewerVersion('0.16.10', '0.16.2')).toBe(true)
  expect(isNewerVersion('0.2.0', '0.16.0')).toBe(false)
})

it('handles version strings of different lengths', () => {
  expect(isNewerVersion('0.17', '0.16.2')).toBe(true)
  expect(isNewerVersion('0.16.2.1', '0.16.2')).toBe(true)
  expect(isNewerVersion('0.16', '0.16.0')).toBe(false)
})

/**
 * Which installer the update notice opens. Asset names mirror the
 * electron-builder artifactName in package.json ("BoostRecord-<ver>-<arch>.dmg"
 * / "BoostRecord-Setup-<ver>.exe"). An arm64 dmg on an Intel Mac shows a 🚫
 * icon and never launches, so the pick must follow the running CPU.
 */
describe('pickDownloadUrl', () => {
  const release = {
    html_url: 'https://github.com/BoxPistols/BoostRecord/releases/tag/v0.31.1',
    assets: [
      {
        name: 'BoostRecord-0.31.1-arm64.dmg',
        browser_download_url: 'https://dl/arm64.dmg'
      },
      {
        name: 'BoostRecord-0.31.1-arm64.dmg.blockmap',
        browser_download_url: 'https://dl/arm64.dmg.blockmap'
      },
      {
        name: 'BoostRecord-0.31.1-arm64.zip',
        browser_download_url: 'https://dl/arm64.zip'
      },
      {
        name: 'BoostRecord-0.31.1-x64.dmg',
        browser_download_url: 'https://dl/x64.dmg'
      },
      {
        name: 'BoostRecord-0.31.1-x64.zip',
        browser_download_url: 'https://dl/x64.zip'
      },
      {
        name: 'BoostRecord-Setup-0.31.1.exe',
        browser_download_url: 'https://dl/setup.exe'
      },
      {
        name: 'BoostRecord-Setup-0.31.1.exe.blockmap',
        browser_download_url: 'https://dl/setup.exe.blockmap'
      },
      {
        name: 'latest-mac.yml',
        browser_download_url: 'https://dl/latest-mac.yml'
      }
    ]
  }

  it('picks the dmg for the running CPU on macOS', () => {
    expect(pickDownloadUrl(release, 'darwin', 'x64')).toBe('https://dl/x64.dmg')
    expect(pickDownloadUrl(release, 'darwin', 'arm64')).toBe(
      'https://dl/arm64.dmg'
    )
  })

  it('picks the Setup exe on Windows regardless of arch', () => {
    expect(pickDownloadUrl(release, 'win32', 'x64')).toBe(
      'https://dl/setup.exe'
    )
    expect(pickDownloadUrl(release, 'win32', 'arm64')).toBe(
      'https://dl/setup.exe'
    )
  })

  it('returns null when nothing matches so the caller falls back to the release page', () => {
    expect(pickDownloadUrl(release, 'linux', 'x64')).toBeNull()
    expect(pickDownloadUrl({ assets: [] }, 'darwin', 'x64')).toBeNull()
    expect(pickDownloadUrl({}, 'darwin', 'x64')).toBeNull()
    expect(pickDownloadUrl(null, 'darwin', 'x64')).toBeNull()
  })

  it('ignores malformed asset entries', () => {
    const odd = {
      assets: [null, {}, { name: 42 }, { name: 'BoostRecord-0.31.1-x64.dmg' }]
    }
    expect(pickDownloadUrl(odd, 'darwin', 'x64')).toBeNull()
  })
})

describe('pickDownloadUrl asset name matching', () => {
  it('ignores dmgs that are not BoostRecord installers', () => {
    const release = {
      assets: [
        { name: 'debug-x64.dmg', browser_download_url: 'https://dl/debug.dmg' },
        {
          name: 'BoostRecord-0.31.2-x64.dmg',
          browser_download_url: 'https://dl/x64.dmg'
        }
      ]
    }
    expect(pickDownloadUrl(release, 'darwin', 'x64')).toBe('https://dl/x64.dmg')
  })
})

describe('hostArch', () => {
  it('reports arm64 for an x64 build running under Rosetta', () => {
    expect(hostArch('x64', true)).toBe('arm64')
  })

  it('reports process.arch when not translated', () => {
    expect(hostArch('x64', false)).toBe('x64')
    expect(hostArch('arm64', false)).toBe('arm64')
    expect(hostArch('x64', undefined)).toBe('x64')
  })
})

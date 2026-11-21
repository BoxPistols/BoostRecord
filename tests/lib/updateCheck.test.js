/**
 * Version comparison used by the GitHub release update check
 * (lib/main-app.js). The old electron-gh-releases updater pointed at the
 * dead upstream repo — these tests pin the replacement's decision logic.
 */
const {
  isNewerVersion,
  pickDownloadUrl,
  hostArch,
  pickLatestRelease,
  classifyUpdateResponse,
  shouldCheckNow,
  shouldNotify,
  selfReplaceBlocker,
  appBundlePath,
  pickZipAsset,
  CHECK_INTERVAL_MS
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

it('never calls a version with non-numeric parts newer', () => {
  expect(isNewerVersion('0.32.0-beta', '0.31.6')).toBe(false)
  expect(isNewerVersion('app-v0.1.3', '0.31.6')).toBe(false)
  expect(isNewerVersion('', '0.31.6')).toBe(false)
  expect(isNewerVersion('v0.32.0', '0.31.6')).toBe(true)
})

/**
 * 同じリポジトリに app/ の Release（app-v*）も出るので、一覧から旧アプリのものだけを選ぶ
 */
describe('pickLatestRelease', () => {
  it('picks the highest v* release, skipping app-v*, drafts and prereleases', () => {
    const releases = [
      { tag_name: 'app-v0.1.3' },
      { tag_name: 'v0.33.0', draft: true },
      { tag_name: 'v0.32.1', prerelease: true },
      { tag_name: 'v0.31.6' },
      { tag_name: 'v0.32.0' },
      { tag_name: 'v0.40.0-beta' },
      null
    ]
    expect(pickLatestRelease(releases).tag_name).toBe('v0.32.0')
  })

  it('compares numerically, not by list order', () => {
    const releases = [{ tag_name: 'v0.9.0' }, { tag_name: 'v0.10.0' }]
    expect(pickLatestRelease(releases).tag_name).toBe('v0.10.0')
  })

  it('returns null when nothing qualifies', () => {
    expect(pickLatestRelease([{ tag_name: 'app-v0.1.0' }])).toBeNull()
    expect(pickLatestRelease(null)).toBeNull()
  })
})

describe('classifyUpdateResponse', () => {
  const body = [{ tag_name: 'v0.32.0' }, { tag_name: 'v0.31.6' }]

  it('reports a newer release as available', () => {
    const r = classifyUpdateResponse(200, body, '0.31.6')
    expect(r.kind).toBe('available')
    expect(r.version).toBe('0.32.0')
    expect(r.release.tag_name).toBe('v0.32.0')
  })

  it('reports the same or older release as latest', () => {
    expect(classifyUpdateResponse(200, body, '0.32.0').kind).toBe('latest')
    expect(classifyUpdateResponse(200, body, '0.33.0').kind).toBe('latest')
    expect(classifyUpdateResponse(200, [], '0.31.6').kind).toBe('latest')
  })

  it('treats 404 (no release yet) as latest', () => {
    expect(classifyUpdateResponse(404, null, '0.31.6').kind).toBe('latest')
  })

  it('treats other statuses and unreadable bodies as failed, not latest', () => {
    expect(classifyUpdateResponse(403, body, '0.31.6').kind).toBe('failed')
    expect(classifyUpdateResponse(500, null, '0.31.6').kind).toBe('failed')
    expect(classifyUpdateResponse(200, null, '0.31.6').kind).toBe('failed')
    expect(classifyUpdateResponse(200, { message: 'x' }, '0.31.6').kind).toBe(
      'failed'
    )
  })
})

describe('shouldCheckNow', () => {
  const now = 1800000000000

  it('checks when there has never been a successful check', () => {
    expect(shouldCheckNow(undefined, now)).toBe(true)
    expect(shouldCheckNow(0, now)).toBe(true)
  })

  it('waits 24 hours after the last success', () => {
    expect(shouldCheckNow(now - CHECK_INTERVAL_MS + 1000, now)).toBe(false)
    expect(shouldCheckNow(now - CHECK_INTERVAL_MS, now)).toBe(true)
  })

  it('checks when the clock moved backwards', () => {
    expect(shouldCheckNow(now + 60000, now)).toBe(true)
  })
})

describe('shouldNotify', () => {
  it('shows the popup once per version for automatic checks', () => {
    expect(shouldNotify('0.32.0', undefined, false)).toBe(true)
    expect(shouldNotify('0.32.0', '0.32.0', false)).toBe(false)
    expect(shouldNotify('0.32.1', '0.32.0', false)).toBe(true)
  })

  it('always shows it for a manual check', () => {
    expect(shouldNotify('0.32.0', '0.32.0', true)).toBe(true)
  })
})

describe('selfReplaceBlocker', () => {
  it('allows an app in a normal folder on macOS', () => {
    expect(selfReplaceBlocker('/Applications/BoostRecord.app', 'darwin')).toBe(
      null
    )
    expect(
      selfReplaceBlocker('/Users/example/Apps/Boost Record.app', 'darwin')
    ).toBe(null)
  })

  it('refuses places it cannot or should not replace', () => {
    expect(
      selfReplaceBlocker(
        '/Volumes/BoostRecord 0.31.6/BoostRecord.app',
        'darwin'
      )
    ).toBe('disk-image')
    expect(
      selfReplaceBlocker(
        '/private/var/folders/xx/T/AppTranslocation/ABC/d/BoostRecord.app',
        'darwin'
      )
    ).toBe('translocated')
    expect(selfReplaceBlocker('/opt/boostrecord', 'darwin')).toBe(
      'not-app-bundle'
    )
    expect(selfReplaceBlocker('C:\\BoostRecord', 'win32')).toBe('platform')
  })
})

describe('appBundlePath', () => {
  it('climbs from the executable to the .app', () => {
    expect(
      appBundlePath('/Applications/BoostRecord.app/Contents/MacOS/BoostRecord')
    ).toBe('/Applications/BoostRecord.app')
  })

  it('returns an empty string for short paths', () => {
    expect(appBundlePath('/a/b')).toBe('')
    expect(appBundlePath(undefined)).toBe('')
  })
})

describe('pickZipAsset', () => {
  const release = {
    assets: [
      { name: 'BoostRecord-0.32.0-arm64.dmg', browser_download_url: 'dmg' },
      {
        name: 'BoostRecord-0.32.0-arm64.zip.blockmap',
        browser_download_url: 'bm'
      },
      { name: 'BoostRecord-0.32.0-arm64.zip', browser_download_url: 'arm' },
      { name: 'BoostRecord-0.32.0-x64.zip', browser_download_url: 'x64' }
    ]
  }

  it('picks the zip for the running CPU', () => {
    expect(pickZipAsset(release, 'arm64')).toBe('arm')
    expect(pickZipAsset(release, 'x64')).toBe('x64')
  })

  it('returns null when the release has no zip', () => {
    expect(pickZipAsset({ assets: [] }, 'arm64')).toBeNull()
    expect(pickZipAsset(null, 'arm64')).toBeNull()
  })
})

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

/**
 * macOSのアプリ内更新の判定（lib/app-updater.js、lib/mac-update-install.js）。
 * 通信・ファイル操作・画面から切り離した部分で、決め事をここで固定する。
 * 名前とバージョンは架空のもの。
 */
const {
  normalizeUpdateMode,
  pickUpdateZip,
  parseRelease,
  expectedSha512,
  updateAction,
  AUTO_INSTALL_IDLE_SECONDS,
  restartBlocker,
  appBundlePath,
  canReplaceAt,
  postInstallResult
} = require('../../lib/update-check')

const sampleRelease = {
  tag_name: 'v9.4.2',
  html_url: 'https://example.invalid/releases/tag/v9.4.2',
  assets: [
    {
      name: 'BoostRecord-9.4.2-arm64.dmg',
      browser_download_url: 'https://dl/a.dmg'
    },
    {
      name: 'BoostRecord-9.4.2-arm64.zip',
      browser_download_url: 'https://dl/a.zip'
    },
    {
      name: 'BoostRecord-9.4.2-arm64.zip.blockmap',
      browser_download_url: 'https://dl/a.bm'
    },
    {
      name: 'BoostRecord-9.4.2-x64.zip',
      browser_download_url: 'https://dl/x.zip'
    },
    {
      name: 'BoostRecord-Setup-9.4.2.exe',
      browser_download_url: 'https://dl/s.exe'
    },
    {
      name: 'latest-mac.yml',
      browser_download_url: 'https://dl/latest-mac.yml'
    }
  ]
}

describe('normalizeUpdateMode', () => {
  it('保存値が無い・読めないときは確認に倒す', () => {
    expect(normalizeUpdateMode('auto')).toBe('auto')
    expect(normalizeUpdateMode('confirm')).toBe('confirm')
    expect(normalizeUpdateMode(undefined)).toBe('confirm')
    expect(normalizeUpdateMode(true)).toBe('confirm')
    expect(normalizeUpdateMode('AUTO')).toBe('confirm')
  })
})

describe('pickUpdateZip', () => {
  it('CPUに合うzipを名前の完全一致で選ぶ', () => {
    expect(pickUpdateZip(sampleRelease, '9.4.2', 'arm64')).toEqual({
      name: 'BoostRecord-9.4.2-arm64.zip',
      url: 'https://dl/a.zip'
    })
    expect(pickUpdateZip(sampleRelease, '9.4.2', 'x64').url).toBe(
      'https://dl/x.zip'
    )
  })

  it('バージョンが違うzipやblockmapは拾わない', () => {
    expect(pickUpdateZip(sampleRelease, '9.4.3', 'arm64')).toBeNull()
    const stale = {
      assets: [
        {
          name: 'BoostRecord-9.4.1-arm64.zip',
          browser_download_url: 'https://dl/old.zip'
        },
        {
          name: 'BoostRecord-9.4.2-arm64.zip.blockmap',
          browser_download_url: 'https://dl/bm'
        }
      ]
    }
    expect(pickUpdateZip(stale, '9.4.2', 'arm64')).toBeNull()
  })

  it('知らないCPUや壊れた応答ではnull', () => {
    expect(pickUpdateZip(sampleRelease, '9.4.2', 'ia32')).toBeNull()
    const odd = {
      assets: [
        {
          name: 'BoostRecord-9.4.2-ia32.zip',
          browser_download_url: 'https://dl/i.zip'
        }
      ]
    }
    expect(pickUpdateZip(odd, '9.4.2', 'ia32')).toBeNull()
    expect(pickUpdateZip(null, '9.4.2', 'arm64')).toBeNull()
    expect(
      pickUpdateZip(
        { assets: [{ name: 'BoostRecord-9.4.2-arm64.zip' }] },
        '9.4.2',
        'arm64'
      )
    ).toBeNull()
  })
})

describe('parseRelease', () => {
  it('macOSではzipとlatest-mac.ymlを拾う', () => {
    expect(parseRelease(sampleRelease, 'darwin', 'arm64')).toEqual({
      version: '9.4.2',
      pageUrl: 'https://example.invalid/releases/tag/v9.4.2',
      downloadUrl: 'https://dl/a.dmg',
      zip: { name: 'BoostRecord-9.4.2-arm64.zip', url: 'https://dl/a.zip' },
      ymlUrl: 'https://dl/latest-mac.yml'
    })
  })

  it('Windowsではzipを持たず、インストーラを開く', () => {
    const r = parseRelease(sampleRelease, 'win32', 'x64')
    expect(r.zip).toBeNull()
    expect(r.ymlUrl).toBeNull()
    expect(r.downloadUrl).toBe('https://dl/s.exe')
  })

  it('合うインストーラが無ければReleaseのページに倒す', () => {
    expect(parseRelease(sampleRelease, 'linux', 'x64').downloadUrl).toBe(
      'https://example.invalid/releases/tag/v9.4.2'
    )
  })

  it('下書き・先行リリース・数字でないタグは対象にしない', () => {
    expect(
      parseRelease(
        Object.assign({}, sampleRelease, { draft: true }),
        'darwin',
        'arm64'
      )
    ).toBeNull()
    expect(
      parseRelease(
        Object.assign({}, sampleRelease, { prerelease: true }),
        'darwin',
        'arm64'
      )
    ).toBeNull()
    expect(
      parseRelease(
        Object.assign({}, sampleRelease, { tag_name: 'v9.5.0-beta' }),
        'darwin',
        'arm64'
      )
    ).toBeNull()
    expect(
      parseRelease(
        Object.assign({}, sampleRelease, { tag_name: '' }),
        'darwin',
        'arm64'
      )
    ).toBeNull()
    expect(parseRelease(null, 'darwin', 'arm64')).toBeNull()
  })
})

describe('expectedSha512', () => {
  // electron-builderが書くlatest-mac.ymlと同じ形
  const yml = [
    'version: 9.4.2',
    'files:',
    '  - url: BoostRecord-9.4.2-arm64.zip',
    '    sha512: AAAAarm64zip==',
    '    size: 100',
    '  - url: BoostRecord-9.4.2-x64.zip',
    '    sha512: BBBBx64zip==',
    '    size: 200',
    'path: BoostRecord-9.4.2-arm64.zip',
    'sha512: AAAAarm64zip=='
  ].join('\n')

  it('zipの名前でsha512を引く', () => {
    expect(expectedSha512(yml, 'BoostRecord-9.4.2-arm64.zip', '9.4.2')).toBe(
      'AAAAarm64zip=='
    )
    expect(expectedSha512(yml, 'BoostRecord-9.4.2-x64.zip', '9.4.2')).toBe(
      'BBBBx64zip=='
    )
  })

  it('照合できないときはnullを返す', () => {
    expect(
      expectedSha512(yml, 'BoostRecord-9.4.2-arm64.zip', '9.4.3')
    ).toBeNull()
    expect(
      expectedSha512(yml, 'BoostRecord-9.4.2-arm64.dmg', '9.4.2')
    ).toBeNull()
    expect(
      expectedSha512('files: [', 'BoostRecord-9.4.2-arm64.zip', '9.4.2')
    ).toBeNull()
    expect(
      expectedSha512('', 'BoostRecord-9.4.2-arm64.zip', '9.4.2')
    ).toBeNull()
    expect(
      expectedSha512(undefined, 'BoostRecord-9.4.2-arm64.zip', '9.4.2')
    ).toBeNull()
  })
})

describe('updateAction', () => {
  const base = {
    mode: 'confirm',
    manual: false,
    canInstall: true,
    alreadyPrompted: false
  }

  it('手で確かめたときは方法によらず聞く', () => {
    expect(updateAction(Object.assign({}, base, { manual: true }))).toBe(
      'prompt'
    )
    expect(
      updateAction(Object.assign({}, base, { manual: true, mode: 'auto' }))
    ).toBe('prompt')
    expect(
      updateAction(
        Object.assign({}, base, { manual: true, alreadyPrompted: true })
      )
    ).toBe('prompt')
  })

  it('確認のときはバージョンごとに1回だけ聞く', () => {
    expect(updateAction(base)).toBe('prompt')
    expect(
      updateAction(Object.assign({}, base, { alreadyPrompted: true }))
    ).toBe('none')
  })

  it('自動のときは聞かずに置き換える', () => {
    expect(updateAction(Object.assign({}, base, { mode: 'auto' }))).toBe(
      'install'
    )
    expect(
      updateAction(
        Object.assign({}, base, { mode: 'auto', alreadyPrompted: true })
      )
    ).toBe('install')
  })

  it('自動でも置き換えられなければ、確認と同じく1回だけ聞く', () => {
    const auto = Object.assign({}, base, { mode: 'auto', canInstall: false })
    expect(updateAction(auto)).toBe('prompt')
    expect(
      updateAction(Object.assign({}, auto, { alreadyPrompted: true }))
    ).toBe('none')
  })

  it('方法が読めなければ確認として扱う', () => {
    expect(updateAction(Object.assign({}, base, { mode: undefined }))).toBe(
      'prompt'
    )
  })
})

describe('restartBlocker', () => {
  const idle = AUTO_INSTALL_IDLE_SECONDS
  const clean = { dirty: false, modalOpen: false }

  it('保存していない編集があれば、手でも自動でも開き直さない', () => {
    expect(
      restartBlocker({
        auto: true,
        reply: { dirty: true, modalOpen: false },
        idleSeconds: idle
      })
    ).toBe('unsaved')
    expect(
      restartBlocker({
        auto: false,
        reply: { dirty: true, modalOpen: false },
        idleSeconds: 0
      })
    ).toBe('unsaved')
  })

  it('画面から答えが無ければ開き直さない', () => {
    expect(
      restartBlocker({ auto: false, reply: null, idleSeconds: idle })
    ).toBe('no-answer')
    expect(
      restartBlocker({ auto: true, reply: undefined, idleSeconds: idle })
    ).toBe('no-answer')
  })

  it('AIの窓や設定の画面が開いていれば開き直さない', () => {
    expect(
      restartBlocker({
        auto: false,
        reply: { dirty: false, modalOpen: true },
        idleSeconds: 0
      })
    ).toBe('modal')
  })

  it('自動のときは操作が止まって5分たつまで待つ', () => {
    expect(
      restartBlocker({ auto: true, reply: clean, idleSeconds: idle - 1 })
    ).toBe('active')
    expect(
      restartBlocker({ auto: true, reply: clean, idleSeconds: undefined })
    ).toBe('active')
    expect(
      restartBlocker({ auto: true, reply: clean, idleSeconds: idle })
    ).toBeNull()
  })

  it('手で更新するときは操作中でも開き直す', () => {
    expect(
      restartBlocker({ auto: false, reply: clean, idleSeconds: 0 })
    ).toBeNull()
  })
})

describe('appBundlePathとcanReplaceAt', () => {
  it('実行ファイルの場所から.appを求める', () => {
    expect(
      appBundlePath('/Applications/BoostRecord.app/Contents/MacOS/BoostRecord')
    ).toBe('/Applications/BoostRecord.app')
    expect(
      appBundlePath(
        '/Users/sample-user/Apps/BoostRecord.app/Contents/MacOS/BoostRecord'
      )
    ).toBe('/Users/sample-user/Apps/BoostRecord.app')
    expect(appBundlePath('/usr/local/bin/electron')).toBeNull()
    expect(appBundlePath('')).toBeNull()
  })

  it('dmgの中や隔離された場所では置き換えない', () => {
    expect(canReplaceAt('/Applications/BoostRecord.app')).toBe(true)
    expect(canReplaceAt('/Volumes/BoostRecord 9.4.2/BoostRecord.app')).toBe(
      false
    )
    expect(
      canReplaceAt(
        '/private/var/folders/xx/AppTranslocation/0000-1111/d/BoostRecord.app'
      )
    ).toBe(false)
    expect(canReplaceAt(null)).toBe(false)
    expect(canReplaceAt('relative/BoostRecord.app')).toBe(false)
  })
})

describe('postInstallResult', () => {
  it('バージョンが変わっていれば更新できた', () => {
    expect(
      postInstallResult({ version: '9.4.2', auto: true }, '9.4.2')
    ).toEqual({
      kind: 'installed',
      auto: true,
      version: '9.4.2'
    })
  })

  it('バージョンが変わっていなければ置き換えに失敗して元に戻った', () => {
    expect(
      postInstallResult({ version: '9.4.2', auto: false }, '9.4.1')
    ).toEqual({
      kind: 'failed',
      auto: false,
      version: '9.4.2'
    })
  })

  it('記録が無ければ何も知らせない', () => {
    expect(postInstallResult(undefined, '9.4.2')).toBeNull()
    expect(postInstallResult({}, '9.4.2')).toBeNull()
    expect(postInstallResult('9.4.2', '9.4.2')).toBeNull()
  })
})

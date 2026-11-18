/**
 * アプリ内更新の置き換えの処理（lib/mac-update-install.jsのSWAP_SCRIPT）を、
 * 作業用のディレクトリに置いた偽の.appで実際に走らせる。openは記録するだけの偽物に差し替える。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { SWAP_SCRIPT } = require('../../lib/mac-update-install')

const describeOnPosix = process.platform === 'win32' ? describe.skip : describe

describeOnPosix('SWAP_SCRIPT', () => {
  let dir, bin, openLog, target, work, staged, script

  function fakeApp(at, marker) {
    fs.mkdirSync(path.join(at, 'Contents'), { recursive: true })
    fs.writeFileSync(path.join(at, 'Contents', 'marker'), marker)
  }

  function runSwap(pid, extra) {
    return spawnSync(
      '/bin/sh',
      [script, String(pid), target, staged, work].concat(extra || ['']),
      {
        env: { PATH: `${bin}:/usr/bin:/bin` },
        encoding: 'utf8'
      }
    )
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swap-test-'))
    bin = path.join(dir, 'bin')
    fs.mkdirSync(bin)
    openLog = path.join(dir, 'open.log')
    fs.writeFileSync(
      path.join(bin, 'open'),
      `#!/bin/sh\necho "$@" >> "${openLog}"\n`,
      { mode: 0o755 }
    )
    target = path.join(dir, 'Apps', 'SampleNotes.app')
    fakeApp(target, 'old')
    work = path.join(dir, 'work')
    staged = path.join(work, 'extract', 'SampleNotes.app')
    fakeApp(staged, 'new')
    script = path.join(dir, 'swap.sh')
    fs.writeFileSync(script, SWAP_SCRIPT, { mode: 0o755 })
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('終了を待ってから置き換え、開き直して作業用のディレクトリを消す', () => {
    // すぐ終わるプロセスのpidを渡す（終了を待つ経路も通る）。jestの子にすると
    // spawnSyncの間に回収されずゾンビで残り、kill -0が通り続けるので孫にする
    const pid = spawnSync(
      '/bin/sh',
      ['-c', 'sleep 0.3 >/dev/null 2>&1 & echo $!'],
      {
        encoding: 'utf8'
      }
    ).stdout.trim()
    const r = runSwap(pid, ['-g'])
    expect(r.status).toBe(0)
    expect(
      fs.readFileSync(path.join(target, 'Contents', 'marker'), 'utf8')
    ).toBe('new')
    expect(fs.existsSync(work)).toBe(false)
    expect(fs.readFileSync(openLog, 'utf8').trim()).toBe(`-g ${target}`)
  })

  it('新しい.appを置けなければ元の.appに戻して開く', () => {
    // 新しい.appの代わりに読めない場所を指すと、退避の後のmvが失敗する
    fs.rmSync(staged, { recursive: true, force: true })
    fs.mkdirSync(staged, { recursive: true })
    fs.chmodSync(path.dirname(staged), 0o500)
    const r = runSwap(999999)
    fs.chmodSync(path.dirname(staged), 0o700)
    expect(r.status).toBe(1)
    expect(
      fs.readFileSync(path.join(target, 'Contents', 'marker'), 'utf8')
    ).toBe('old')
    expect(fs.readFileSync(openLog, 'utf8').trim()).toBe(target)
  })

  it('置き換え先が.appでなければ何もしない', () => {
    const r = spawnSync('/bin/sh', [script, '999999', dir, staged, work, ''], {
      env: { PATH: `${bin}:/usr/bin:/bin` }
    })
    expect(r.status).toBe(2)
    expect(fs.existsSync(dir)).toBe(true)
    expect(fs.existsSync(openLog)).toBe(false)
  })
})

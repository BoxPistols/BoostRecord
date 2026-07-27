'use strict'

const metaKeyHold = require('browser/lib/metaKeyHold')

// navigator.userAgent は jsdom 既定で Mac ではないため ctrlKey 系で検証する。
// Mac 判定はモジュール読み込み時に確定するので、テスト内では切り替えない。
function keyEvent(props) {
  return Object.assign(
    { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
    props
  )
}

describe('getJumpNumber', () => {
  it('修飾キー + 1〜9 を数値で返す', () => {
    expect(
      metaKeyHold.getJumpNumber(keyEvent({ ctrlKey: true, keyCode: 49 }))
    ).toBe(1)
    expect(
      metaKeyHold.getJumpNumber(keyEvent({ ctrlKey: true, keyCode: 57 }))
    ).toBe(9)
  })

  it('修飾キーが無ければ null', () => {
    expect(metaKeyHold.getJumpNumber(keyEvent({ keyCode: 49 }))).toBe(null)
  })

  it('0 は対象外（Cmd+0 は Actual Size に割り当て済み）', () => {
    expect(
      metaKeyHold.getJumpNumber(keyEvent({ ctrlKey: true, keyCode: 48 }))
    ).toBe(null)
  })

  it('Shift や Alt が混ざる組み合わせは対象外', () => {
    expect(
      metaKeyHold.getJumpNumber(
        keyEvent({ ctrlKey: true, shiftKey: true, keyCode: 49 })
      )
    ).toBe(null)
    expect(
      metaKeyHold.getJumpNumber(
        keyEvent({ ctrlKey: true, altKey: true, keyCode: 49 })
      )
    ).toBe(null)
  })

  it('数字以外のキーは対象外', () => {
    expect(
      metaKeyHold.getJumpNumber(keyEvent({ ctrlKey: true, keyCode: 65 }))
    ).toBe(null)
  })
})

describe('subscribe', () => {
  it('押下と解放で1回ずつ通知し、リピートでは通知しない', () => {
    const seen = []
    const off = metaKeyHold.subscribe(v => seen.push(v))

    window.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Control', ctrlKey: true })
    )
    // 押しっぱなしのリピート（repeat: true）は無視される
    window.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Control',
        ctrlKey: true,
        repeat: true
      })
    )
    window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Control' }))

    expect(seen).toEqual([true, false])
    off()
  })

  it('解除後は通知されない', () => {
    const seen = []
    const off = metaKeyHold.subscribe(v => seen.push(v))
    off()

    window.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Control', ctrlKey: true })
    )
    window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Control' }))

    expect(seen).toEqual([])
  })

  it('ウィンドウが blur したら押しっぱなしを解除する', () => {
    const seen = []
    const off = metaKeyHold.subscribe(v => seen.push(v))

    window.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Control', ctrlKey: true })
    )
    window.dispatchEvent(new window.Event('blur'))

    expect(seen).toEqual([true, false])
    expect(metaKeyHold.isHeld()).toBe(false)
    off()
  })
})

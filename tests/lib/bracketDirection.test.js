// スニペットのタブ左右移動（Cmd/Ctrl + Shift + [ / ]）のキー判定。
//
// 本題はキーボード配列。e.code / keyCode は **US 配列の物理位置**を指すので、
// JIS 配列では [ ] を取り違える。実機で「右へは動くが左へ動けない」という
// 報告が出たのがこれ。e.key を優先することで両配列を通す。
const { getBracketDirection } = require('browser/lib/metaKeyHold')

const SUPER = process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'

function ev(overrides) {
  return Object.assign(
    { metaKey: false, ctrlKey: false, shiftKey: true, altKey: false },
    { [SUPER]: true },
    overrides
  )
}

describe('US 配列', () => {
  it('Shift 中の { } で左右に動く', () => {
    expect(
      getBracketDirection(ev({ key: '{', code: 'BracketLeft', keyCode: 219 }))
    ).toBe(-1)
    expect(
      getBracketDirection(ev({ key: '}', code: 'BracketRight', keyCode: 221 }))
    ).toBe(1)
  })
})

describe('JIS 配列（物理位置が US とずれる）', () => {
  it('[ は US の ] の位置に来るが、左へ動く', () => {
    // JIS の [ キー: code は BracketRight、keyCode は 221 になる
    expect(
      getBracketDirection(ev({ key: '{', code: 'BracketRight', keyCode: 221 }))
    ).toBe(-1)
  })

  it('] は US の \\ の位置に来るが、右へ動く', () => {
    // JIS の ] キー: code は Backslash、keyCode は 220。
    // e.key を見なければどちらにも当たらず無反応だった
    expect(
      getBracketDirection(ev({ key: '}', code: 'Backslash', keyCode: 220 }))
    ).toBe(1)
  })
})

describe('e.key が無い環境（保険の code / keyCode 経路）', () => {
  it('US 配列前提で左右に落とす', () => {
    expect(getBracketDirection(ev({ code: 'BracketLeft' }))).toBe(-1)
    expect(getBracketDirection(ev({ code: 'BracketRight' }))).toBe(1)
    expect(getBracketDirection(ev({ keyCode: 219 }))).toBe(-1)
    expect(getBracketDirection(ev({ keyCode: 221 }))).toBe(1)
  })
})

describe('対象外', () => {
  it('修飾キーが揃わなければ 0', () => {
    expect(getBracketDirection({ shiftKey: true, key: '{' })).toBe(0)
    expect(getBracketDirection(ev({ key: '{', shiftKey: false }))).toBe(0)
    expect(getBracketDirection(ev({ key: '{', altKey: true }))).toBe(0)
  })

  it('無関係なキーは 0', () => {
    expect(
      getBracketDirection(ev({ key: 'a', code: 'KeyA', keyCode: 65 }))
    ).toBe(0)
  })
})

// サイドバー3サイクル（Cmd+B）の純粋ロジック。
// 既存ユーザーの設定には sideNavMode が無いので、旧 boolean からの導出が本題。
const {
  EXPANDED,
  FOLDED,
  HIDDEN,
  SIDE_NAV_MODES,
  isValidSideNavMode,
  nextSideNavMode,
  resolveSideNavMode,
  isFoldedFor,
  isHiddenFor,
  resolvePaneMode,
  resolveNoteListMode
} = require('browser/main/lib/sideNavMode')

describe('nextSideNavMode', () => {
  it('EXPANDED → FOLDED → HIDDEN → EXPANDED と巡回する', () => {
    expect(nextSideNavMode(EXPANDED)).toBe(FOLDED)
    expect(nextSideNavMode(FOLDED)).toBe(HIDDEN)
    expect(nextSideNavMode(HIDDEN)).toBe(EXPANDED)
  })

  it('3回で元に戻る', () => {
    let mode = EXPANDED
    for (let i = 0; i < 3; i++) mode = nextSideNavMode(mode)
    expect(mode).toBe(EXPANDED)
  })

  it('壊れた値からは EXPANDED へ復帰する（未知の状態で止まらない）', () => {
    expect(nextSideNavMode('NOPE')).toBe(EXPANDED)
    expect(nextSideNavMode(undefined)).toBe(EXPANDED)
    expect(nextSideNavMode(null)).toBe(EXPANDED)
  })
})

describe('resolveSideNavMode', () => {
  it('sideNavMode があればそれを使う', () => {
    expect(resolveSideNavMode({ sideNavMode: HIDDEN })).toBe(HIDDEN)
    expect(resolveSideNavMode({ sideNavMode: FOLDED })).toBe(FOLDED)
  })

  it('旧 boolean しか無い設定を引き継ぐ（畳んで使っていた人を戻さない）', () => {
    expect(resolveSideNavMode({ isSideNavFolded: true })).toBe(FOLDED)
    expect(resolveSideNavMode({ isSideNavFolded: false })).toBe(EXPANDED)
  })

  it('sideNavMode が壊れていれば旧 boolean へ落とす', () => {
    expect(
      resolveSideNavMode({ sideNavMode: 'NOPE', isSideNavFolded: true })
    ).toBe(FOLDED)
  })

  it('設定そのものが無くても既定を返す', () => {
    expect(resolveSideNavMode(undefined)).toBe(EXPANDED)
    expect(resolveSideNavMode(null)).toBe(EXPANDED)
    expect(resolveSideNavMode({})).toBe(EXPANDED)
  })
})

describe('導出値', () => {
  it('isFoldedFor は EXPANDED 以外で true（旧 boolean 参照の互換）', () => {
    expect(isFoldedFor(EXPANDED)).toBe(false)
    expect(isFoldedFor(FOLDED)).toBe(true)
    expect(isFoldedFor(HIDDEN)).toBe(true)
  })

  it('isHiddenFor は HIDDEN のみ', () => {
    expect(isHiddenFor(HIDDEN)).toBe(true)
    expect(isHiddenFor(FOLDED)).toBe(false)
    expect(isHiddenFor(EXPANDED)).toBe(false)
  })

  it('巡回順と定数が一致している', () => {
    expect(SIDE_NAV_MODES).toEqual([EXPANDED, FOLDED, HIDDEN])
    SIDE_NAV_MODES.forEach(m => expect(isValidSideNavMode(m)).toBe(true))
    expect(isValidSideNavMode('NOPE')).toBe(false)
  })
})

describe('ノート一覧も同じ3サイクル', () => {
  it('noteListMode を読む', () => {
    expect(resolveNoteListMode({ noteListMode: HIDDEN })).toBe(HIDDEN)
  })

  it('旧 isNoteListFolded から引き継ぐ', () => {
    expect(resolveNoteListMode({ isNoteListFolded: true })).toBe(FOLDED)
    expect(resolveNoteListMode({ isNoteListFolded: false })).toBe(EXPANDED)
  })

  it('汎用版はキー名を差し替えて使える（実装を1箇所に保つ）', () => {
    expect(resolvePaneMode({ aMode: HIDDEN }, 'aMode', 'aBool')).toBe(HIDDEN)
    expect(resolvePaneMode({ aBool: true }, 'aMode', 'aBool')).toBe(FOLDED)
    expect(resolvePaneMode({}, 'aMode', 'aBool')).toBe(EXPANDED)
  })
})

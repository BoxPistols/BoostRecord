// ノート内検索の当たり判定。エディタとプレビューで共通に使うので、
// ここがずれると片方だけ件数が合わない形で壊れる。
const {
  findMatches,
  stepIndex,
  formatCount
} = require('browser/lib/findInText')

describe('findMatches', () => {
  it('位置を先頭から順に返す', () => {
    expect(findMatches('needle x needle', 'needle')).toEqual([
      { start: 0, end: 6 },
      { start: 9, end: 15 }
    ])
  })

  it('既定は大文字小文字を区別しない', () => {
    expect(findMatches('Needle NEEDLE', 'needle')).toHaveLength(2)
  })

  it('区別する指定も効く', () => {
    expect(
      findMatches('Needle NEEDLE needle', 'needle', { caseSensitive: true })
    ).toEqual([{ start: 14, end: 20 }])
  })

  it('重なる一致は数えない（次へで同じ場所に留まって見える）', () => {
    expect(findMatches('aaa', 'aa')).toEqual([{ start: 0, end: 2 }])
  })

  it('日本語も位置がずれない', () => {
    const text = 'これは検索の検索です'
    const hits = findMatches(text, '検索')
    expect(hits).toEqual([
      { start: 3, end: 5 },
      { start: 6, end: 8 }
    ])
    hits.forEach(h => expect(text.slice(h.start, h.end)).toBe('検索'))
  })

  it('全角と半角は別物として扱う', () => {
    expect(findMatches('ABC ＡＢＣ', 'ABC')).toHaveLength(1)
  })

  it('空クエリは0件（全文が光るのを防ぐ）', () => {
    expect(findMatches('anything', '')).toEqual([])
  })

  it('壊れた入力でも落ちない', () => {
    expect(findMatches(undefined, 'a')).toEqual([])
    expect(findMatches('a', undefined)).toEqual([])
    expect(findMatches(null, null)).toEqual([])
  })

  it('大文字小文字で長さが変わる文字では位置を優先する', () => {
    // 'ß'.toUpperCase() は 'SS' で長さが変わる。畳むと位置がずれるので
    // 区別する側へ倒す（見つからないより、ずれた場所を光らせる方が悪い）
    const text = 'straße'
    const hits = findMatches(text, 'ß')
    hits.forEach(h => expect(text.slice(h.start, h.end)).toBe('ß'))
  })
})

describe('stepIndex', () => {
  it('次へで進み、端で先頭へ回り込む', () => {
    expect(stepIndex(0, 3, 1)).toBe(1)
    expect(stepIndex(2, 3, 1)).toBe(0)
  })

  it('前へで戻り、先頭から末尾へ回り込む', () => {
    expect(stepIndex(1, 3, -1)).toBe(0)
    expect(stepIndex(0, 3, -1)).toBe(2)
  })

  it('未選択からは次へ=先頭 / 前へ=末尾', () => {
    expect(stepIndex(-1, 3, 1)).toBe(0)
    expect(stepIndex(-1, 3, -1)).toBe(2)
  })

  it('0件なら -1', () => {
    expect(stepIndex(0, 0, 1)).toBe(-1)
    expect(stepIndex(-1, 0, -1)).toBe(-1)
  })
})

describe('formatCount', () => {
  it('1 起点で見せる', () => {
    expect(formatCount(0, 17)).toBe('1 / 17')
    expect(formatCount(2, 17)).toBe('3 / 17')
  })

  it('未選択でも総数は見せる', () => {
    expect(formatCount(-1, 17)).toBe('0 / 17')
  })

  it('0件は 0 / 0', () => {
    expect(formatCount(-1, 0)).toBe('0 / 0')
  })
})

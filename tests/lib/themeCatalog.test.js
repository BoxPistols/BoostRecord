// テーマ一覧の並べ替え。**「推奨」の中身が実測とずれていないこと**が肝心で、
// ここがずれると「推奨と書いてあるのに読めない」という最悪の案内になる。
const {
  RECOMMENDED_THEMES,
  MEASURED_CLEAN_THEMES,
  BOOSTERS_THEMES,
  groupThemes,
  displayName,
  isRecommended
} = require('browser/lib/themeCatalog')
const {
  collectAll,
  MIN_RATIO
} = require('../../dev-scripts/theme-contrast-report')

describe('推奨リストは実測と一致する', () => {
  const measured = collectAll()
  const byName = measured.reduce((acc, row) => {
    acc[row.name || row.theme] = row
    return acc
  }, {})

  it('測れているテーマがそれなりの数ある（測定自体が壊れていない証拠）', () => {
    expect(measured.length).toBeGreaterThan(40)
  })

  RECOMMENDED_THEMES.forEach(name => {
    it(`${name}: 実測で全トークンが ${MIN_RATIO}:1 以上`, () => {
      const row = byName[name]
      expect(row).toBeDefined()
      expect(row.failingTokens).toEqual([])
    })
  })

  it('基準を満たすテーマを取りこぼしていない', () => {
    const clean = measured
      .filter(row => row.failing === 0)
      .map(row => row.theme)
      .sort()
    expect(clean).toEqual(RECOMMENDED_THEMES.slice().sort())
  })
})

describe('groupThemes', () => {
  const themes = [
    { name: 'zenburn' },
    { name: 'theboosters-dark' },
    { name: 'base16-light' },
    { name: 'mbo' },
    { name: 'theboosters-light' }
  ]

  it('推奨を先頭に、自前テーマをさらに先頭に置く', () => {
    const { recommended } = groupThemes(themes)
    expect(recommended.map(t => t.name)).toEqual([
      'theboosters-light',
      'theboosters-dark',
      'mbo'
    ])
  })

  it('残りはその他へ回る', () => {
    const { others } = groupThemes(themes)
    expect(others.map(t => t.name)).toEqual(['zenburn', 'base16-light'])
  })

  it('一覧に無い推奨テーマは黙って落とす（存在しない選択肢を出さない）', () => {
    const { recommended } = groupThemes([{ name: 'mbo' }])
    expect(recommended.map(t => t.name)).toEqual(['mbo'])
  })

  it('空でも落ちない', () => {
    expect(groupThemes(undefined)).toEqual({ recommended: [], others: [] })
  })
})

describe('displayName', () => {
  it('自前テーマは読める名前で出す', () => {
    expect(displayName('theboosters-light')).toBe('The Boosters Light')
  })

  it('表に無いものは元の名前のまま（勝手に意訳しない）', () => {
    expect(displayName('erlang-dark')).toBe('erlang-dark')
  })
})

describe('isRecommended', () => {
  it('自前テーマは推奨', () => {
    BOOSTERS_THEMES.forEach(name => expect(isRecommended(name)).toBe(true))
  })

  it('実測で落ちたものは推奨しない', () => {
    expect(isRecommended('base16-light')).toBe(false)
    expect(isRecommended('dracula')).toBe(false)
  })

  it('MEASURED_CLEAN_THEMES は全部推奨に入っている', () => {
    MEASURED_CLEAN_THEMES.forEach(name =>
      expect(isRecommended(name)).toBe(true)
    )
  })
})

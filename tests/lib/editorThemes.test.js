// UI とエディタの明暗が食い違うと、ダークテーマでエディタのペインだけが
// 白い柱として残る。連動の判定をここで固定する。
const {
  isDarkEditorTheme,
  coupleEditorTheme,
  migrateUntouchedEditorTheme,
  DEFAULT_LIGHT_EDITOR_THEME,
  DEFAULT_DARK_EDITOR_THEME
} = require('browser/lib/editorThemes')

describe('isDarkEditorTheme', () => {
  it('一覧にあるものは暗い', () => {
    expect(isDarkEditorTheme('monokai')).toBe(true)
    expect(isDarkEditorTheme('dracula')).toBe(true)
  })

  it('未知のテーマは明るい扱い（暗いと誤判定する方が実害が大きい）', () => {
    expect(isDarkEditorTheme('base16-light')).toBe(false)
    expect(isDarkEditorTheme('some-new-theme')).toBe(false)
    expect(isDarkEditorTheme(undefined)).toBe(false)
  })
})

describe('coupleEditorTheme', () => {
  it('食い違っている時だけ揃える', () => {
    expect(coupleEditorTheme(true, 'base16-light')).toBe(
      DEFAULT_DARK_EDITOR_THEME
    )
    expect(coupleEditorTheme(false, 'monokai')).toBe(DEFAULT_LIGHT_EDITOR_THEME)
  })

  it('明暗が一致しているものは変えない（意図した組み合わせを潰さない）', () => {
    expect(coupleEditorTheme(true, 'dracula')).toBe('dracula')
    expect(coupleEditorTheme(false, 'eclipse')).toBe('eclipse')
  })
})

describe('migrateUntouchedEditorTheme', () => {
  it('ダーク UI + 既定のままなら暗いテーマへ寄せる', () => {
    expect(migrateUntouchedEditorTheme(true, DEFAULT_LIGHT_EDITOR_THEME)).toBe(
      DEFAULT_DARK_EDITOR_THEME
    )
  })

  it('自分で選んだ明るいテーマは書き換えない', () => {
    expect(migrateUntouchedEditorTheme(true, 'eclipse')).toBe('eclipse')
  })

  it('明るい UI では何もしない（暗いエディタを選ぶ自由を残す）', () => {
    expect(migrateUntouchedEditorTheme(false, 'monokai')).toBe('monokai')
    expect(migrateUntouchedEditorTheme(false, DEFAULT_LIGHT_EDITOR_THEME)).toBe(
      DEFAULT_LIGHT_EDITOR_THEME
    )
  })
})

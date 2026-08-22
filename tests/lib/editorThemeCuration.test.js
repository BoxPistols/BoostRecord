// 選択肢の絞り込みと、外したテーマの寄せ先。
//
// 対応表は手で書いてあるので、**列挙式で確かめない**。実際に組み上がった一覧を
// 走査して「どれか 1 つでも行き先を持たないものがあれば落ちる」形にする。
// リストに書き忘れたものを最初から見ない検査では、書き忘れ自体を検出できない。
const consts = require('browser/lib/consts')
const {
  resolveEditorTheme,
  isDarkEditorTheme,
  CURATED_EDITOR_THEMES,
  CURATED_EDITOR_THEME_NAMES,
  EDITOR_THEME_ALIASES,
  DEFAULT_DARK_EDITOR_THEME,
  DEFAULT_LIGHT_EDITOR_THEME
} = require('browser/lib/editorThemes')

describe('組み上がった一覧（consts.THEMES）', () => {
  it('同じ名前が 2 回出ない', () => {
    const names = consts.THEMES.map(t => t.name)
    const duplicated = names.filter((n, i) => names.indexOf(n) !== i)
    expect(duplicated).toEqual([])
  })

  it('専用クラスを持たない補助ファイルは入らない', () => {
    expect(consts.THEMES.map(t => t.name)).not.toContain('ambiance-mobile')
  })

  it('default は読み込むファイルを持たない', () => {
    const def = consts.THEMES.find(t => t.name === 'default')
    expect(def).toBeDefined()
    expect(def.path).toBeNull()
  })

  it('残すと決めたテーマはすべて実在する', () => {
    const names = consts.THEMES.map(t => t.name)
    CURATED_EDITOR_THEME_NAMES.forEach(name => {
      expect(names).toContain(name)
    })
  })

  it('オリジナルの rockabilly が入っている', () => {
    const rockabilly = consts.THEMES.find(t => t.name === 'rockabilly')
    expect(rockabilly).toBeDefined()
    expect(rockabilly.path).toMatch(/extra_scripts/)
  })
})

describe('寄せ先の対応表', () => {
  it('一覧のどのテーマも、残すか寄せ先を持つかのどちらか', () => {
    const orphans = consts.THEMES.map(t => t.name).filter(
      name =>
        CURATED_EDITOR_THEME_NAMES.indexOf(name) === -1 &&
        !EDITOR_THEME_ALIASES[name]
    )
    expect(orphans).toEqual([])
  })

  it('寄せ先はすべて残すテーマ', () => {
    const invalid = Object.entries(EDITOR_THEME_ALIASES).filter(
      ([, target]) => CURATED_EDITOR_THEME_NAMES.indexOf(target) === -1
    )
    expect(invalid).toEqual([])
  })

  it('寄せても明暗が反転しない', () => {
    // 暗いテーマの利用者が白地に飛ばされるのが一番まずい。
    // 表を見ても分からず、使って初めて分かる種類の壊れ方
    const flipped = Object.entries(EDITOR_THEME_ALIASES).filter(
      ([from, to]) => isDarkEditorTheme(from) !== isDarkEditorTheme(to)
    )
    expect(flipped).toEqual([])
  })

  it('残すテーマの明暗は group と一致する', () => {
    CURATED_EDITOR_THEMES.forEach(theme => {
      expect(isDarkEditorTheme(theme.name)).toBe(theme.group === 'dark')
    })
  })
})

describe('resolveEditorTheme', () => {
  it('残っているものはそのまま', () => {
    expect(resolveEditorTheme('monokai')).toBe('monokai')
    expect(resolveEditorTheme('rockabilly')).toBe('rockabilly')
    expect(resolveEditorTheme('solarized dark')).toBe('solarized dark')
  })

  it('外したものは代表へ寄せる', () => {
    expect(resolveEditorTheme('material-palenight')).toBe('material')
    expect(resolveEditorTheme('twilight')).toBe('rockabilly')
    expect(resolveEditorTheme('eclipse')).toBe('default')
  })

  it('未知の名前は明暗だけ合わせて既定へ落とす', () => {
    expect(resolveEditorTheme('some-new-theme')).toBe(
      DEFAULT_LIGHT_EDITOR_THEME
    )
    expect(resolveEditorTheme(undefined)).toBe(DEFAULT_LIGHT_EDITOR_THEME)
  })

  it('既定値の 2 つは寄せ先としても成立する', () => {
    expect(CURATED_EDITOR_THEME_NAMES).toContain(DEFAULT_LIGHT_EDITOR_THEME)
    expect(CURATED_EDITOR_THEME_NAMES).toContain(DEFAULT_DARK_EDITOR_THEME)
  })

  it('何度通しても結果が変わらない', () => {
    consts.THEMES.forEach(theme => {
      const once = resolveEditorTheme(theme.name)
      expect(resolveEditorTheme(once)).toBe(once)
    })
  })
})

describe('明暗の分類（実測とのずれを直したもの）', () => {
  it('mdn-like は背景 #fff なので明るい', () => {
    expect(isDarkEditorTheme('mdn-like')).toBe(false)
  })

  it('abbott は背景 #231c14 なので暗い', () => {
    expect(isDarkEditorTheme('abbott')).toBe(true)
  })

  it('rockabilly は暗い', () => {
    expect(isDarkEditorTheme('rockabilly')).toBe(true)
  })
})

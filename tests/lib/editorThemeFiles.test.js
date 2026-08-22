// エディタテーマ一覧の組み立て。
// fs を差し替えて、実ファイルに依存せず「起きていた 3 つの不具合」を固定する。
const {
  definesOwnClass,
  buildEditorThemes,
  curateEditorThemes
} = require('browser/lib/editorThemeFiles')

// dir -> { ファイル名: 中身 }
const makeFs = tree => ({
  readDir: dir => {
    if (!tree[dir]) throw new Error('ENOENT ' + dir)
    return Object.keys(tree[dir])
  },
  readFile: file => {
    const dir = file.substring(0, file.lastIndexOf('/'))
    const name = file.substring(file.lastIndexOf('/') + 1)
    return tree[dir][name]
  }
})

const themeCss = name => `.cm-s-${name}.CodeMirror { background: #000; }`

describe('definesOwnClass', () => {
  it('自分のクラスを定義していれば true', () => {
    expect(definesOwnClass(themeCss('dracula'), 'dracula')).toBe(true)
    // .CodeMirror が付かない書き方（icecoder / panda-syntax がこれ）
    expect(definesOwnClass('.cm-s-icecoder { color: #666; }', 'icecoder')).toBe(
      true
    )
  })

  it('前方一致で騙されない', () => {
    // ambiance-mobile.css の中身は .cm-s-ambiance の補助だけ
    const mobile = '@media (max-width: 480px) { .cm-s-ambiance.CodeMirror {} }'
    expect(definesOwnClass(mobile, 'ambiance-mobile')).toBe(false)
    expect(definesOwnClass(mobile, 'ambiance')).toBe(true)
  })
})

describe('buildEditorThemes', () => {
  const bundled = '/bundled'
  const extra = '/extra'

  it('同名が 2 つのディレクトリにあっても 1 件だけ出る（先に書いた方が勝つ）', () => {
    const fsStub = makeFs({
      [bundled]: { 'nord.css': themeCss('nord') },
      [extra]: { 'nord.css': themeCss('nord') }
    })
    const themes = buildEditorThemes({ dirs: [bundled, extra], ...fsStub })
    const nord = themes.filter(t => t.name === 'nord')
    expect(nord).toHaveLength(1)
    expect(nord[0].path).toBe('/bundled/nord.css')
  })

  it('自分のクラスを定義していないファイルは一覧に出さない', () => {
    const fsStub = makeFs({
      [bundled]: {
        'ambiance.css': themeCss('ambiance'),
        'ambiance-mobile.css': '@media (max-width: 480px) { .cm-s-ambiance {} }'
      },
      [extra]: {}
    })
    const names = buildEditorThemes({ dirs: [bundled, extra], ...fsStub }).map(
      t => t.name
    )
    expect(names).toContain('ambiance')
    expect(names).not.toContain('ambiance-mobile')
  })

  it('フィルタが全部落とした時は落とさずに出す（選択肢を空にしない）', () => {
    const fsStub = makeFs({
      [bundled]: { 'broken.css': '/* クラス定義が無い */' },
      [extra]: {}
    })
    const names = buildEditorThemes({ dirs: [bundled, extra], ...fsStub }).map(
      t => t.name
    )
    expect(names).toContain('broken')
  })

  it('読めないディレクトリは無視する（extra 側は空になり得る）', () => {
    const fsStub = makeFs({ [bundled]: { 'nord.css': themeCss('nord') } })
    const names = buildEditorThemes({ dirs: [bundled, extra], ...fsStub }).map(
      t => t.name
    )
    expect(names).toContain('nord')
  })

  it('default は先頭に来て、読み込むファイルを持たない', () => {
    const fsStub = makeFs({
      [bundled]: { 'zenburn.css': themeCss('zenburn') },
      [extra]: {}
    })
    const themes = buildEditorThemes({ dirs: [bundled, extra], ...fsStub })
    expect(themes[0].name).toBe('default')
    expect(themes[0].path).toBeNull()
    expect(themes[0].className).toBe('cm-s-default')
  })

  it('solarized は 1 ファイルから明暗 2 件に分かれる', () => {
    const fsStub = makeFs({
      [bundled]: { 'solarized.css': '.cm-s-solarized.cm-s-dark {}' },
      [extra]: {}
    })
    const themes = buildEditorThemes({ dirs: [bundled, extra], ...fsStub })
    const names = themes.map(t => t.name)
    expect(names).toContain('solarized dark')
    expect(names).toContain('solarized light')
    expect(names).not.toContain('solarized')
    const dark = themes.find(t => t.name === 'solarized dark')
    expect(dark.className).toBe('cm-s-solarized cm-s-dark')
    expect(dark.path).toBe('/bundled/solarized.css')
  })

  it('css 以外のファイルは無視する', () => {
    const fsStub = makeFs({
      [bundled]: { 'nord.css': themeCss('nord'), 'README.md': '# readme' },
      [extra]: {}
    })
    const names = buildEditorThemes({ dirs: [bundled, extra], ...fsStub }).map(
      t => t.name
    )
    expect(names).not.toContain('README')
  })
})

describe('curateEditorThemes', () => {
  const themes = [
    { name: 'default', path: null, className: 'cm-s-default' },
    { name: 'monokai', path: '/a/monokai.css', className: 'cm-s-monokai' },
    { name: 'zenburn', path: '/a/zenburn.css', className: 'cm-s-zenburn' }
  ]

  it('指定した順に並べて返す', () => {
    expect(
      curateEditorThemes(themes, ['zenburn', 'default']).map(t => t.name)
    ).toEqual(['zenburn', 'default'])
  })

  it('ファイルが見つからないものは黙って落とす', () => {
    expect(
      curateEditorThemes(themes, ['monokai', 'zenburn', 'nonexistent']).map(
        t => t.name
      )
    ).toEqual(['monokai', 'zenburn'])
  })

  it('総崩れした時は絞らず全部返す（空の select を出さない）', () => {
    expect(curateEditorThemes(themes, ['nope', 'nope2'])).toEqual(themes)
    // 1 件しか残らないのも総崩れ扱い。選択肢 1 つの select は選べないのと同じ
    expect(curateEditorThemes(themes, ['monokai', 'nope'])).toEqual(themes)
  })
})

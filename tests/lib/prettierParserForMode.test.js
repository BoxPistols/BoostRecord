// 整形がどのパーサを選ぶか。**間違えると本文が壊れる**ので、
// 「対応が無いときに markdown へ落ちない」ことが一番大事。
const { prettierParserForMode } = require('browser/lib/prettierParserForMode')

describe('Markdown', () => {
  it('本文エディタ(Boost Flavored Markdown)は markdown', () => {
    expect(prettierParserForMode('text/x-bfm')).toBe('markdown')
  })

  it('mime が取れなくても mode 名 bfm なら markdown', () => {
    expect(prettierParserForMode(null, 'bfm')).toBe('markdown')
  })

  it('素の markdown / gfm も markdown', () => {
    expect(prettierParserForMode('text/x-markdown')).toBe('markdown')
    expect(prettierParserForMode('text/x-gfm')).toBe('markdown')
  })
})

describe('対応していない構文', () => {
  // ここが null にならないと、シェルのスニペットに markdown 整形がかかり、
  // `#` 行が見出しとして扱われてブロックの間に空行が入る（実際の不具合）
  it('シェルは null', () => {
    expect(prettierParserForMode('text/x-sh', 'shell')).toBeNull()
  })

  it('Python / Ruby / Go も null', () => {
    expect(prettierParserForMode('text/x-python', 'python')).toBeNull()
    expect(prettierParserForMode('text/x-ruby', 'ruby')).toBeNull()
    expect(prettierParserForMode('text/x-go', 'go')).toBeNull()
  })

  it('Plain Text は null', () => {
    expect(prettierParserForMode('text/plain', 'null')).toBeNull()
  })

  it('mode が空でも null（既定で markdown に落とさない）', () => {
    expect(prettierParserForMode(null, null)).toBeNull()
    expect(prettierParserForMode(undefined)).toBeNull()
    expect(prettierParserForMode('')).toBeNull()
  })
})

describe('prettier が扱える構文', () => {
  it('JavaScript は babel', () => {
    expect(prettierParserForMode('text/javascript')).toBe('babel')
    expect(prettierParserForMode('text/jsx')).toBe('babel')
  })

  it('JSON は json（javascript モードと兼用なので mime で見分ける）', () => {
    expect(prettierParserForMode('application/json')).toBe('json')
  })

  it('TypeScript は typescript', () => {
    expect(prettierParserForMode('application/typescript')).toBe('typescript')
  })

  it('スタイル系はそれぞれのパーサ', () => {
    expect(prettierParserForMode('text/css')).toBe('css')
    expect(prettierParserForMode('text/x-scss')).toBe('scss')
    expect(prettierParserForMode('text/x-less')).toBe('less')
  })

  it('YAML / HTML / Vue / GraphQL', () => {
    expect(prettierParserForMode('text/x-yaml')).toBe('yaml')
    expect(prettierParserForMode('text/html')).toBe('html')
    expect(prettierParserForMode('text/x-vue')).toBe('vue')
    expect(prettierParserForMode('application/graphql')).toBe('graphql')
  })

  it('大文字小文字は問わない', () => {
    expect(prettierParserForMode('TEXT/X-BFM')).toBe('markdown')
  })
})

describe('mode がオブジェクトで渡された場合', () => {
  it('name を見る', () => {
    expect(prettierParserForMode({ name: 'text/x-bfm' })).toBe('markdown')
  })
})

describe('markdown 整形がシェルを壊すこと自体の確認', () => {
  // 「なぜ refuse するのか」の根拠。prettier の挙動が変わったら気づけるよう
  // ここで固定しておく
  it('# で始まる行の間に空行が入る', () => {
    const prettier = require('prettier')
    const source = '# ----------------\n# 9. エイリアス\n# ----------------\n'
    const formatted = prettier.format(source, { parser: 'markdown' })
    expect(formatted).not.toBe(source)
    expect(formatted).toMatch(/\n\n/)
  })
})

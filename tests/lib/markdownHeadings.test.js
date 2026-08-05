// 目次用の見出し抽出。落とし穴はコードフェンス内の # と設定レベルの扱い。
const {
  extractHeadings,
  normalizeLevelRange,
  MIN_LEVEL,
  MAX_LEVEL
} = require('browser/lib/markdownHeadings')

describe('extractHeadings', () => {
  it('レベルと本文と行番号を返す（行は 0 起点）', () => {
    expect(extractHeadings('# A\n\n## B', { maxLevel: 6 })).toEqual([
      { level: 1, text: 'A', line: 0 },
      { level: 2, text: 'B', line: 2 }
    ])
  })

  it('既定は H1-H3', () => {
    const md = '# a\n## b\n### c\n#### d'
    expect(extractHeadings(md).map(h => h.level)).toEqual([1, 2, 3])
  })

  it('設定レベルの外は落とす', () => {
    const md = '# a\n## b\n### c'
    expect(
      extractHeadings(md, { minLevel: 2, maxLevel: 3 }).map(h => h.text)
    ).toEqual(['b', 'c'])
  })

  it('閉じの # は本文に含めない', () => {
    expect(extractHeadings('## B ##')[0].text).toBe('B')
  })

  it('# の後ろに空白が無いものは見出しではない', () => {
    expect(extractHeadings('#NotAHeading')).toEqual([])
  })

  it('本文が空の見出しは拾わない', () => {
    expect(extractHeadings('#\n##   ')).toEqual([])
  })
})

describe('コードブロックの中', () => {
  it('``` フェンス内の # を拾わない', () => {
    const md = '# real\n\n```sh\n# just a comment\n```\n\n## also real'
    expect(extractHeadings(md).map(h => h.text)).toEqual(['real', 'also real'])
  })

  it('~~~ フェンスでも同じ', () => {
    const md = '# real\n~~~\n# nope\n~~~'
    expect(extractHeadings(md).map(h => h.text)).toEqual(['real'])
  })

  it('``` と ~~~ を取り違えない（別記号では閉じない）', () => {
    const md = '```\n~~~\n# still inside\n```\n# out'
    expect(extractHeadings(md).map(h => h.text)).toEqual(['out'])
  })

  it('4 文字以上のフェンスは3文字では閉じない', () => {
    const md = '````\n```\n# still inside\n````\n# out'
    expect(extractHeadings(md).map(h => h.text)).toEqual(['out'])
  })

  it('閉じ忘れたフェンス以降は拾わない（誤検出より取りこぼす方が安全）', () => {
    expect(extractHeadings('# a\n```\n# b')).toEqual([
      { level: 1, text: 'a', line: 0 }
    ])
  })

  it('インデントされたコードブロックの # も拾わない', () => {
    expect(extractHeadings('    # indented\n\t# tabbed\n# real')).toEqual([
      { level: 1, text: 'real', line: 2 }
    ])
  })
})

describe('normalizeLevelRange', () => {
  it('既定は 1..3', () => {
    expect(normalizeLevelRange(undefined, undefined)).toEqual({
      min: 1,
      max: 3
    })
  })

  it('範囲外は丸める', () => {
    expect(normalizeLevelRange(0, 99)).toEqual({
      min: MIN_LEVEL,
      max: MAX_LEVEL
    })
  })

  it('min > max は入れ替える（設定中に目次が空にならない）', () => {
    expect(normalizeLevelRange(4, 2)).toEqual({ min: 2, max: 4 })
  })

  it('文字列でも受ける（select の値は文字列で来る）', () => {
    expect(normalizeLevelRange('2', '4')).toEqual({ min: 2, max: 4 })
  })
})

describe('入力が壊れている場合', () => {
  it('文字列でなければ空', () => {
    expect(extractHeadings(undefined)).toEqual([])
    expect(extractHeadings(null)).toEqual([])
    expect(extractHeadings('')).toEqual([])
  })
})

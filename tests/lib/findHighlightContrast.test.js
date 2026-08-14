// 検索ハイライトの配色が本文用の 4.5:1 を満たすことを、**実際のソースから
// 読み取って**検算する。定数を書き写すと、色を変えたときにテストだけ古くなる。
//
// エディタ側は「実際に描かれる色」が CodeMirror テーマとの詳細度勝負で
// 変わりうるので、宣言の検算だけでは足りない（実測は
// pnpm run e2e:findcontrast）。ここは宣言が崩れていないことの番人。
const fs = require('fs')
const path = require('path')
const { contrastRatio } = require('../../dev-scripts/contrast-util')

const MIN_RATIO = 4.5
const root = path.join(__dirname, '..', '..')
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')

/**
 * ブロックの中から宣言を1つ取り出す。無ければ null（fail-closed）。
 * **`color` は `background-color` に前方一致で巻き込まれる。**
 * 直前がハイフンや英数でないことを必ず見る（これで一度誤検出した）
 */
function declaration(block, property) {
  const match = block.match(
    new RegExp(`(?:^|[^-\\w])${property}\\s*:?\\s*(#[0-9a-fA-F]{3,6})`)
  )
  return match ? match[1] : null
}

/** セレクタに続くブロックを取り出す。Stylus はインデント、CSS は波括弧 */
function cssBlock(source, selector) {
  const index = source.indexOf(selector)
  if (index === -1) return null
  const rest = source.slice(index + selector.length)
  const braced = rest.match(/^\s*\{([^}]*)\}/)
  if (braced) return braced[1]
  // Stylus: 次の非インデント行までを1ブロックとみなす
  const lines = rest.split('\n').slice(1)
  const body = []
  for (const line of lines) {
    if (line.trim() === '') break
    if (!/^\s+\S/.test(line)) break
    body.push(line)
  }
  return body.join('\n')
}

describe('エディタのハイライト (CodeEditor.styl)', () => {
  const source = read('browser/components/CodeEditor.styl')
  const block = cssBlock(source, ':global(.CodeMirror .tb-find-all)')

  it('規則が存在する', () => {
    expect(block).not.toBeNull()
  })

  it('背景と文字色の両方を指定している', () => {
    // 片方だけだと、もう片方は構文色のまま残って読めなくなる
    expect(declaration(block, 'background-color')).not.toBeNull()
    expect(declaration(block, 'color')).not.toBeNull()
  })

  it('構文色に負けないよう !important で当てている', () => {
    // テーマ側の `.cm-s-<theme> span.cm-string` の方が詳細度が高い
    expect(block).toMatch(/color\s*#?[0-9a-fA-F]+\s*!important/)
  })

  it(`4.5:1 以上ある`, () => {
    const ratio = contrastRatio(
      declaration(block, 'color'),
      declaration(block, 'background-color')
    )
    expect(ratio).toBeGreaterThanOrEqual(MIN_RATIO)
  })
})

describe('プレビューのハイライト (formatHTML.js)', () => {
  const source = read('browser/main/lib/dataApi/formatHTML.js')

  // ::highlight() は疑似要素なので、色は宣言した通りに塗られる。
  // 宣言の検算で足りる（エディタと違って詳細度勝負にならない）
  ;[
    ['::highlight(tb-find-all)', '一致すべて'],
    ['::highlight(tb-find-active)', '現在地']
  ].forEach(([selector, label]) => {
    const block = cssBlock(source, selector)

    it(`${label}: 規則が存在する`, () => {
      expect(block).not.toBeNull()
    })

    it(`${label}: 背景と文字色の両方を指定している`, () => {
      expect(declaration(block, 'background-color')).not.toBeNull()
      expect(declaration(block, 'color')).not.toBeNull()
    })

    it(`${label}: 4.5:1 以上ある`, () => {
      const ratio = contrastRatio(
        declaration(block, 'color'),
        declaration(block, 'background-color')
      )
      expect(ratio).toBeGreaterThanOrEqual(MIN_RATIO)
    })
  })
})

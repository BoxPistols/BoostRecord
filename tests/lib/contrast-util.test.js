// コントラストの計算そのものを既知の値で検算する。
// 「測る側が間違っていた」を防ぐのが目的なので、ここが緩いと
// 検索ハイライトの判定ごと意味を失う。
const {
  parseCssColor,
  compositeOver,
  contrastRatio
} = require('../../dev-scripts/contrast-util')

describe('parseCssColor', () => {
  it('#rrggbb を読む', () => {
    expect(parseCssColor('#ffeb3b')).toEqual({ r: 255, g: 235, b: 59, a: 1 })
  })

  it('#rgb を展開する', () => {
    expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
  })

  it('rgb() / rgba() を読む', () => {
    expect(parseCssColor('rgb(26, 26, 26)')).toEqual({
      r: 26,
      g: 26,
      b: 26,
      a: 1
    })
    expect(parseCssColor('rgba(255, 255, 255, 0.04)')).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 0.04
    })
  })

  it('読めない文字列は null（黙って 0 にしない）', () => {
    expect(parseCssColor('rebeccapurple')).toBeNull()
    expect(parseCssColor(undefined)).toBeNull()
  })
})

describe('contrastRatio', () => {
  it('白と黒は 21:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })

  it('同じ色は 1:1', () => {
    expect(contrastRatio('#ffeb3b', '#ffeb3b')).toBeCloseTo(1, 5)
  })

  it('順序を入れ替えても同じ', () => {
    const a = contrastRatio('#1a1a1a', '#ffeb3b')
    const b = contrastRatio('#ffeb3b', '#1a1a1a')
    expect(a).toBeCloseTo(b, 10)
  })

  it('検索ハイライトの配色は本文用の 4.5:1 を満たす', () => {
    // 蛍光ペン(#ffeb3b) の上に黒文字(#1a1a1a)
    expect(contrastRatio('#1a1a1a', '#ffeb3b')).toBeGreaterThan(4.5)
    // 現在地(#ff9800) の上に黒文字
    expect(contrastRatio('#1a1a1a', '#ff9800')).toBeGreaterThan(4.5)
  })

  it('**壊れていた組み合わせは落ちる**（判定が効いている証拠）', () => {
    // base16-light の文字列トークン(#f4bf75)が蛍光ペンの上に残ると読めない。
    // これが 4.5 を超えるようなら、この検算自体が壊れている
    expect(contrastRatio('#f4bf75', '#ffeb3b')).toBeLessThan(2)
  })
})

describe('compositeOver', () => {
  it('不透明ならそのまま', () => {
    const top = { r: 10, g: 20, b: 30, a: 1 }
    expect(compositeOver(top, { r: 0, g: 0, b: 0, a: 1 })).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 1
    })
  })

  it('半透明は下の面と混ざる', () => {
    const top = { r: 255, g: 255, b: 255, a: 0.5 }
    const bottom = { r: 0, g: 0, b: 0, a: 1 }
    expect(compositeOver(top, bottom)).toEqual({
      r: 127.5,
      g: 127.5,
      b: 127.5,
      a: 1
    })
  })

  it('半透明を不透明として測ると数字が嘘になる', () => {
    const faint = parseCssColor('rgba(255,255,255,0.04)')
    const dark = parseCssColor('#1e1e1e')
    const naive = contrastRatio('#9a9a9a', faint)
    const correct = contrastRatio('#9a9a9a', compositeOver(faint, dark))
    expect(naive).not.toBeCloseTo(correct, 1)
  })
})

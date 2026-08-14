// コントラスト比の計算。**測る側が間違っていることがある**ので、
// 既知の値（白黒 = 21:1 等）で検算できる純粋関数として切り出す。
//
// 半透明を不透明として扱うと数字が嘘になる。getComputedStyle が
// rgba(...) を返したら、下の面と合成してから測ること（compositeOver）。

// CSS の名前付き色。CodeMirror のテーマが実際に使っているものだけ持つ。
// **黙って落とすと「測れていないのに不足0件」になる**ので、必要になったら足す
const NAMED_COLORS = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  navy: '#000080',
  purple: '#800080',
  teal: '#008080',
  lime: '#00ff00',
  aqua: '#00ffff',
  cyan: '#00ffff',
  fuchsia: '#ff00ff',
  magenta: '#ff00ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  pink: '#ffc0cb',
  brown: '#a52a2a',
  violet: '#ee82ee',
  gold: '#ffd700',
  darkgoldenrod: '#b8860b',
  goldenrod: '#daa520',
  darkgreen: '#006400',
  darkblue: '#00008b',
  darkred: '#8b0000',
  darkcyan: '#008b8b',
  darkorange: '#ff8c00',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  lightblue: '#add8e6',
  lightgreen: '#90ee90',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  skyblue: '#87ceeb',
  steelblue: '#4682b4',
  royalblue: '#4169e1',
  slateblue: '#6a5acd',
  seagreen: '#2e8b57',
  tomato: '#ff6347',
  salmon: '#fa8072',
  khaki: '#f0e68c',
  plum: '#dda0dd',
  orchid: '#da70d6',
  turquoise: '#40e0d0',
  chocolate: '#d2691e',
  firebrick: '#b22222',
  indianred: '#cd5c5c',
  peru: '#cd853f',
  tan: '#d2b48c',
  wheat: '#f5deb3',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  azure: '#f0ffff',
  lavender: '#e6e6fa',
  linen: '#faf0e6',
  snow: '#fffafa'
}

/** '#rgb' / '#rrggbb' / 'rgb(r,g,b)' / 'rgba(r,g,b,a)' / 名前付き色 を {r,g,b,a} に */
function parseCssColor(input) {
  if (typeof input !== 'string') return null
  const value = input.trim().toLowerCase()
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (NAMED_COLORS[value]) return parseCssColor(NAMED_COLORS[value])

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) {
    const body = hex[1]
    const full =
      body.length === 3
        ? body
            .split('')
            .map(c => c + c)
            .join('')
        : body
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1
    }
  }

  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/
  )
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4])
    }
  }
  return null
}

/** 上の色を下の色に重ねて不透明にする（source-over） */
function compositeOver(top, bottom) {
  const a = top.a
  if (a >= 1) return { r: top.r, g: top.g, b: top.b, a: 1 }
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1
  }
}

/** WCAG 2.1 の相対輝度 */
function relativeLuminance(color) {
  const channel = v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return (
    0.2126 * channel(color.r) +
    0.7152 * channel(color.g) +
    0.0722 * channel(color.b)
  )
}

/**
 * コントラスト比。引数は文字列でも {r,g,b,a} でもよい。
 * 半透明は呼び出し側で合成してから渡す（ここでは合成しない）
 */
function contrastRatio(fg, bg) {
  const a = typeof fg === 'string' ? parseCssColor(fg) : fg
  const b = typeof bg === 'string' ? parseCssColor(bg) : bg
  if (!a || !b) return null
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const light = Math.max(l1, l2)
  const dark = Math.min(l1, l2)
  return (light + 0.05) / (dark + 0.05)
}

module.exports = {
  parseCssColor,
  compositeOver,
  relativeLuminance,
  contrastRatio
}

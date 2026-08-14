// コントラスト比の計算。**測る側が間違っていることがある**ので、
// 既知の値（白黒 = 21:1 等）で検算できる純粋関数として切り出す。
//
// 半透明を不透明として扱うと数字が嘘になる。getComputedStyle が
// rgba(...) を返したら、下の面と合成してから測ること（compositeOver）。

/** '#rgb' / '#rrggbb' / 'rgb(r,g,b)' / 'rgba(r,g,b,a)' を {r,g,b,a} にする */
function parseCssColor(input) {
  if (typeof input !== 'string') return null
  const value = input.trim().toLowerCase()
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

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

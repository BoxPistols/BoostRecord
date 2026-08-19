// Rockabilly カラースキームの原盤（assets/rockabilly/palette.json）。
//
// 配布物（VS Code / iTerm2 / CodeMirror ほか）はすべてここから生成する。
// 手で書き写した値が混ざっていないことと、コントラストの下限を守っている
// ことを固定する。数値は「目で見て決めた」を残さないため必ず計算で確かめる。
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const palette = JSON.parse(
  fs.readFileSync(path.join(root, 'assets/rockabilly/palette.json'), 'utf8')
)

const luminance = hex => {
  const c = hex.replace('#', '')
  const channel = i => {
    const v = parseInt(c.substr(i * 2, 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}
const contrast = (a, b) => {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const entries = []
Object.entries(palette.ui).forEach(([k, v]) =>
  entries.push(['ui.' + k, v.value])
)
Object.entries(palette.syntax).forEach(([k, v]) =>
  entries.push(['syntax.' + k, v.value])
)
Object.entries(palette.ansi).forEach(([k, v]) => entries.push(['ansi.' + k, v]))

describe('パレット', () => {
  it('すべて 6 桁の 16 進数', () => {
    const invalid = entries.filter(
      ([, value]) => !/^#[0-9A-Fa-f]{6}$/.test(value)
    )
    expect(invalid).toEqual([])
  })

  it('地に対するコントラストが下限を満たす', () => {
    const bg = palette.contrast.background
    const { text, nonText, dim } = palette.contrast.minimums
    const failed = entries
      .filter(([key]) => palette.contrast.exempt.indexOf(key) === -1)
      .map(([key, value]) => {
        const min =
          palette.contrast.nonText.indexOf(key) !== -1
            ? nonText
            : palette.contrast.dim.indexOf(key) !== -1
            ? dim
            : text
        return { key, value, min, ratio: contrast(value, bg) }
      })
      .filter(row => row.ratio < row.min)
      .map(
        row => `${row.key} ${row.value} ${row.ratio.toFixed(2)}:1 < ${row.min}`
      )
    expect(failed).toEqual([])
  })

  it('補正が要る値が実際に含まれている（検査が空回りしていない）', () => {
    // 全部が余裕で通る色しか無いなら、この検査には意味が無い。
    // 下限に近い色（5:1 未満）が最低 1 つはあることを確かめる
    const bg = palette.contrast.background
    const tight = entries.filter(
      ([key, value]) =>
        palette.contrast.exempt.indexOf(key) === -1 && contrast(value, bg) < 5
    )
    expect(tight.length).toBeGreaterThan(0)
  })

  it('アプリの UI テーマと同じ地・同じ朱赤を使っている', () => {
    const styl = fs.readFileSync(
      path.join(root, 'browser/styles/index.styl'),
      'utf8'
    )
    const readVar = name => {
      const m = new RegExp(
        `\\$ui-rockabilly-${name}\\s*=\\s*(#[0-9A-Fa-f]{6})`
      ).exec(styl)
      return m && m[1]
    }
    expect(palette.ui.bg.value).toBe(readVar('backgroundColor'))
    expect(palette.ui.accent.value).toBe(readVar('active-color'))
    expect(palette.ui.fg.value).toBe(readVar('text-color'))
    expect(palette.ui.border.value).toBe(readVar('borderColor'))
  })
})

describe('生成物', () => {
  const codemirror = fs.readFileSync(
    path.join(root, 'extra_scripts/codemirror/theme/rockabilly.css'),
    'utf8'
  )

  it('CodeMirror テーマが原盤と同じ色になっている', () => {
    // 原盤を触って build.mjs を回し忘れると、アプリだけ古い色のまま残る
    expect(codemirror).toContain(`background: ${palette.ui.bg.value}`)
    expect(codemirror).toContain(`color: ${palette.ui.fg.value}`)
    expect(codemirror).toContain(palette.syntax.red.value)
    expect(codemirror).toContain(palette.syntax.green.value)
    expect(codemirror).toContain(palette.syntax.comment.value)
  })

  it('自分のクラスを定義している（一覧のフィルタを通る）', () => {
    const { definesOwnClass } = require('browser/lib/editorThemeFiles')
    expect(definesOwnClass(codemirror, 'rockabilly')).toBe(true)
  })
})

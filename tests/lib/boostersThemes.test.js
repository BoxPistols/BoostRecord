// 自前のエディタテーマは「全トークンが 4.5:1 以上」であることが存在理由。
// 色を1つ触っただけで前提が崩れるので、実ファイルから測って固定する。
const fs = require('fs')
const path = require('path')
const {
  measure,
  MIN_RATIO
} = require('../../dev-scripts/theme-contrast-report')

const root = path.join(__dirname, '..', '..')
const THEME_DIR = path.join(root, 'extra_scripts', 'codemirror', 'theme')

// トークンを1つも読めていないのに緑、を防ぐための下限。
// 現在17（__text 含む）。減らすときは意図的に下げること
const MIN_MEASURED_TOKENS = 15

const THEMES = [
  { name: 'theboosters-light', dark: false },
  { name: 'theboosters-dark', dark: true }
]

describe('The Boosters のエディタテーマ', () => {
  THEMES.forEach(({ name, dark }) => {
    const file = path.join(THEME_DIR, `${name}.css`)

    it(`${name}: ファイルがある（アプリはこの位置から拾う）`, () => {
      expect(fs.existsSync(file)).toBe(true)
    })

    describe(name, () => {
      const css = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
      const result = css ? measure(name, css) : null

      it('背景とトークン色が読み取れる', () => {
        expect(result).not.toBeNull()
        expect(result.background).toBeTruthy()
      })

      it(`十分な数のトークンを測れている（${MIN_MEASURED_TOKENS} 以上）`, () => {
        // ここが緩いと「1つも測れていないので不足0件」で素通りする
        expect(result.measured).toBeGreaterThanOrEqual(MIN_MEASURED_TOKENS)
      })

      it(`全トークンが ${MIN_RATIO}:1 以上`, () => {
        expect(result.failingTokens).toEqual([])
      })

      it(`明暗の判定が意図どおり（dark=${dark}）`, () => {
        expect(result.isDark).toBe(dark)
      })
    })
  })

  it('コメントも基準を満たす（ここが割れているテーマが多い）', () => {
    THEMES.forEach(({ name }) => {
      const css = fs.readFileSync(path.join(THEME_DIR, `${name}.css`), 'utf8')
      const result = measure(name, css)
      expect(result.ratios.comment).toBeGreaterThanOrEqual(MIN_RATIO)
    })
  })
})

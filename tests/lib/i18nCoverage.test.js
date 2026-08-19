// 画面に出る文字列の翻訳漏れを検出する。
//
// i18n-2 は訳が無いキーをそのまま返すので、日本語の画面に英語が 1 行だけ混ざる。
// エラーにならず、その画面を開いた人しか気づけない。
//
// **列挙式では書かない。** 「このファイルのこのキー」と並べる検査は、リストに
// 載せ忘れた箇所を最初から見ないので、書き忘れ自体を検出できない。browser/ を
// 走査して、i18n.__() に渡している文字列リテラルを全部拾う。
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const ja = JSON.parse(
  fs.readFileSync(path.join(root, 'locales/ja.json'), 'utf8')
)

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return acc.concat(walk(full))
    return entry.name.endsWith('.js') ? acc.concat(full) : acc
  }, [])
}

// i18n.__('...') / i18n.__("...") の第 1 引数がリテラルのものを集める。
// 変数を渡している箇所は静的には追えないので、下の「動的なキー」で別途見る
function collectKeys() {
  const found = new Map()
  walk(path.join(root, 'browser')).forEach(file => {
    const source = fs.readFileSync(file, 'utf8')
    const patterns = [
      /i18n\.__\(\s*'((?:[^'\\]|\\.)*)'/g,
      /i18n\.__\(\s*"((?:[^"\\]|\\.)*)"/g
    ]
    patterns.forEach(re => {
      let m
      while ((m = re.exec(source))) {
        const key = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"')
        if (!found.has(key)) found.set(key, [])
        found.get(key).push(path.relative(root, file))
      }
    })
  })
  return found
}

describe('日本語ロケール', () => {
  const keys = collectKeys()

  it('走査自体が空回りしていない', () => {
    // 収集が壊れて 0 件になると、以下の検査がすべて素通りする
    expect(keys.size).toBeGreaterThan(300)
  })

  it('画面で使っているキーはすべて訳がある', () => {
    const missing = Array.from(keys.entries())
      .filter(([key]) => !(key in ja))
      .map(([key, files]) => `${key}  <- ${files[0]}`)
    expect(missing).toEqual([])
  })

  it('訳が空文字になっていない', () => {
    const empty = Object.entries(ja)
      .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
      .map(([key]) => key)
    expect(empty).toEqual([])
  })

  it('動的に渡しているキー（エディタテーマの説明）にも訳がある', () => {
    // note は i18n.__(entry.note) の形で渡すため、上の走査では拾えない
    const { CURATED_EDITOR_THEMES } = require('browser/lib/editorThemes')
    const missing = CURATED_EDITOR_THEMES.filter(
      theme => !(theme.note in ja)
    ).map(theme => `${theme.name}: ${theme.note}`)
    expect(missing).toEqual([])
  })

  it('エディタテーマの説明は英語で持つ（訳はロケール側）', () => {
    // 実装側に日本語を直接書くと、英語のロケールで日本語が出る
    const { CURATED_EDITOR_THEMES } = require('browser/lib/editorThemes')
    const nonAscii = CURATED_EDITOR_THEMES.filter(theme =>
      // eslint-disable-next-line no-control-regex
      /[^\x00-\x7F]/.test(theme.note + theme.label)
    ).map(theme => theme.name)
    expect(nonAscii).toEqual([])
  })
})

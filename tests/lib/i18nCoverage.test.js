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

// 読み込まれないロケールファイルは、置いてあっても翻訳されない。upstream から
// 引き継いだ 19 言語がこの状態で、言語欄にも出てこなかった（#141）。
// 「ファイルはあるが対応言語に入っていない」も「対応言語なのにファイルが無い」も
// どちらも黙って壊れるので、両方向で突き合わせる。
describe('対応言語とロケールファイルの対応', () => {
  const { getLocales } = require('browser/lib/Languages')
  const declared = getLocales()
    .slice()
    .sort()
  const onDisk = fs
    .readdirSync(path.join(root, 'locales'))
    .filter(name => name.endsWith('.json'))
    .map(name => name.replace(/\.json$/, ''))
    .sort()

  it('対応言語のファイルがすべてある', () => {
    expect(declared.filter(locale => onDisk.indexOf(locale) === -1)).toEqual([])
  })

  it('読み込まれないロケールファイルが残っていない', () => {
    expect(onDisk.filter(locale => declared.indexOf(locale) === -1)).toEqual([])
  })
})

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

  it('動的に渡しているキー（カスタム CSS のテンプレート）にも訳がある', () => {
    // labelKey / noteKeys は i18n.__(template.labelKey) の形で渡すため、
    // 上の走査では拾えない
    const { CUSTOM_CSS_TEMPLATES } = require('browser/lib/customCSSTemplates')
    const missing = CUSTOM_CSS_TEMPLATES.reduce(
      (acc, template) =>
        acc.concat(
          [template.labelKey]
            .concat(template.noteKeys)
            .filter(key => !(key in ja))
            .map(key => `${template.id}: ${key}`)
        ),
      []
    )
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

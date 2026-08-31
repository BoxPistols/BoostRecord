// ロケールの網羅状況を測る。
//
// i18nCoverage.test.js は「画面で使っているキーに ja の訳があるか」を見る。
// こちらは locales/ 全体を突き合わせ、en に対する各ロケールの欠落を数える。
//
// **必須にしているのは ja だけ。** 他の 19 言語は訳が用意できていないので、
// ここで落とすと開発が止まる。数えるところまでを固定して、どの言語を必須に
// するかが決まったら REQUIRED に足す（#141）。
const fs = require('fs')
const path = require('path')

const localesDir = path.resolve(__dirname, '..', '..', 'locales')

function load(name) {
  return JSON.parse(
    fs.readFileSync(path.join(localesDir, name + '.json'), 'utf8')
  )
}

function localeNames() {
  return fs
    .readdirSync(localesDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -5))
}

// 訳さないもの。固有名詞・拡張子・キー名
const NOT_TRANSLATED = [
  'Ctrl',
  '.md',
  '.txt',
  '.html',
  '.pdf',
  'vim',
  'emacs',
  'GitHub',
  'Twitter',
  'BoostRecord',
  'Copyright (C) 2017 - 2019 BoostIO',
  'JWT'
]

const REQUIRED = ['ja']

describe('ロケールの網羅', () => {
  const en = load('en')

  it('走査自体が空回りしていない', () => {
    expect(Object.keys(en).length).toBeGreaterThan(300)
    expect(localeNames().length).toBeGreaterThan(15)
  })

  it('すべてのロケールが JSON として読める', () => {
    localeNames().forEach(name => {
      expect(() => load(name)).not.toThrow()
    })
  })

  REQUIRED.forEach(name => {
    it(`${name} に en のキーがすべてある`, () => {
      const locale = load(name)
      const missing = Object.keys(en).filter(k => !(k in locale))
      expect(missing).toEqual([])
    })

    it(`${name} に英語のまま残った訳が無い`, () => {
      const locale = load(name)
      const untranslated = Object.keys(en).filter(
        k => locale[k] === k && NOT_TRANSLATED.indexOf(k) === -1
      )
      expect(untranslated).toEqual([])
    })
  })

  it('en に使われていないキーを残さない（訳の対象が増え続ける）', () => {
    // 画面で使っているキーの一覧は i18nCoverage.test.js と同じ方法で集める
    const root = path.resolve(__dirname, '..', '..')
    const walk = dir =>
      fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, entry) => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) return acc.concat(walk(full))
        return entry.name.endsWith('.js') ? acc.concat(full) : acc
      }, [])

    const used = new Set()
    walk(path.join(root, 'browser')).forEach(file => {
      const source = fs.readFileSync(file, 'utf8')
      const patterns = [
        /i18n\.__\(\s*'((?:[^'\\]|\\.)*)'/g,
        /i18n\.__\(\s*"((?:[^"\\]|\\.)*)"/g
      ]
      patterns.forEach(re => {
        let m
        while ((m = re.exec(source))) {
          used.add(m[1].replace(/\\'/g, "'").replace(/\\"/g, '"'))
        }
      })
    })

    // 動的に渡しているキー（テーマの説明・CSS テンプレート・言語名など）は
    // 静的には追えないので、ここでは「明らかに死んでいるもの」だけを見る。
    // PlantUML は描画を廃止したのに訳のキーだけ残っていた
    expect(Object.keys(en)).not.toContain('PlantUML Server')
  })
})

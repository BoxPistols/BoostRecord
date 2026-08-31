// 設定 → インターフェースの保存は、handleUIChange が this.refs から全項目を
// まとめて読む。**表示中のまとまり以外も描かれていること**が前提で、どれか 1 つでも
// 描かれなくなると、その行で TypeError になって保存が丸ごと落ちる
// （実際に、廃止した項目の ref を読み続けてテーマ設定が一切保存できなくなっていた）。
//
// サブタブは display の切り替えだけで実装してある。アンマウントする実装に
// 変えた時にここで気づけるよう、ref の対応を静的に照合する。
const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    '..',
    '..',
    'browser/main/modals/PreferencesModal/UiTab.js'
  ),
  'utf8'
)

// コメントの中の this.refs.xxx を拾わない（廃止した項目の経緯が
// コメントに残っている）
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map(line => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n')

function collect(re) {
  const found = new Set()
  let m
  while ((m = re.exec(code))) found.add(m[1])
  return found
}

// handleUIChange が読んでいる ref 名
const read = collect(/this\.refs\.([A-Za-z0-9_]+)/g)
// render が置いている ref 名
const declared = collect(/\bref='([A-Za-z0-9_]+)'/g)

describe('UiTab の ref', () => {
  it('走査自体が空回りしていない', () => {
    expect(read.size).toBeGreaterThan(20)
    expect(declared.size).toBeGreaterThan(20)
  })

  it('保存が読む ref はすべて render に置かれている', () => {
    const missing = [...read].filter(name => !declared.has(name))
    expect(missing).toEqual([])
  })

  it('サブタブは display の切り替えで、中身を外していない', () => {
    // 条件付きレンダリング（&& や三項でセクションごと消す）に変えると、
    // 隠れているまとまりの ref が消えて保存が落ちる
    expect(source).toContain('sectionStyle(name)')
    expect(source).toMatch(/display:\s*this\.state\.activeSection === name/)
  })
})

describe('UiTab のまとまり切り替え', () => {
  it('切り替えたら CodeMirror を測り直す', () => {
    // display:none の中で作られた CodeMirror は寸法を測れず、空の箱として
    // 描かれる。カスタム CSS と Prettier 設定と MarkdownLint 設定がこれに当たる
    expect(source).toContain('refreshCodeMirrors()')
    expect(source).toMatch(
      /handleSectionChange\(key\)[\s\S]*refreshCodeMirrors\(\)/
    )
    // ナビは setState を直に呼ばず、測り直しを伴う方を通す
    expect(source).toContain('onClick={() => this.handleSectionChange(')
    expect(source).not.toMatch(
      /onClick=\{\(\) => this\.setState\(\{ activeSection/
    )
  })

  it('見本のモードを両方の CodeMirror に読み込む', () => {
    // autoLoadMode は渡した instance にしかモードを当て直さないので、
    // 片方だけだと色が付かない
    expect(source).toContain('this.codeMirrorInstance.getCodeMirror()')
    expect(source).toContain('this.codeBlockSampleInstance.getCodeMirror()')
  })

  it('見本のために足した stylesheet を閉じる時に片付ける', () => {
    expect(source).toMatch(/componentWillUnmount\(\)[\s\S]*codeBlockHighLight/)
  })
})

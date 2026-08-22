// Markdown テーブルの偶数行に敷く帯（.cm-table-row-even）。
//
// 以前はテーマごとに 1 行ずつ色を生成した表で、表に無いテーマは先頭の明るい
// 汎用規則へ落ちていた。暗いテーマでは本文が白く塗り潰され、しかも「どのテーマを
// 選んだか」で再現したりしなかったりした（同梱 65 テーマ中 23 に規則が無かった）。
//
// テーマごとに列挙する方式に戻ると同じことが起きるので、**規則が 1 本であること**と
// **不透明な色を使っていないこと**を固定する。テーマ名を列挙して検査すると、
// 列挙し忘れたテーマを最初から見ないので、この壊れ方は検出できない。
const fs = require('fs')
const path = require('path')

const cssPath = path.resolve(
  __dirname,
  '..',
  '..',
  'extra_scripts/codemirror/mode/bfm/bfm.css'
)
const css = fs.readFileSync(cssPath, 'utf8')
// コメントを外してから見る（説明文にテーマ名が並んでいる）
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('テーブル行の帯', () => {
  it('規則は 1 本だけ', () => {
    const matches = rules.match(/\.cm-table-row-even/g) || []
    expect(matches).toHaveLength(1)
  })

  it('テーマ名で分岐していない', () => {
    const themed = rules.match(/\.cm-s-[a-z0-9-]+/g) || []
    expect(themed).toEqual([])
  })

  it('地の明暗に依らないよう半透明で重ねている', () => {
    const decl = /background-color:\s*([^;]+);/.exec(rules)
    expect(decl).not.toBeNull()
    const value = decl[1].trim()
    // 不透明な色だと、明るい地か暗い地のどちらかで必ず破綻する
    expect(value).toMatch(/^rgba\(/)
    const alpha = parseFloat(value.split(',')[3])
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThan(0.25)
  })

  it('生成タスクが復活していない', () => {
    // grunt bfm がこのファイルを書き戻すと、テーマ列挙の方式に逆戻りする
    const grunt = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'gruntfile.js'),
      'utf8'
    )
    expect(grunt).not.toMatch(/registerTask\(\s*'bfm'/)
  })
})

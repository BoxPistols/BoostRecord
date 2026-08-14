#!/usr/bin/env node
// エディタのテーマごとに、構文トークンの文字色と背景のコントラスト比を測る。
//
// 「コメントが読めない」は感想ではなく数字で確定できる。色は全部 CSS に
// 書いてあるので、LLM にも目視にも頼らず決定的に出す。
//
//   node dev-scripts/theme-contrast-report.js            # 既定テーマだけ詳細
//   node dev-scripts/theme-contrast-report.js --all      # 全テーマの一覧
//   node dev-scripts/theme-contrast-report.js --json     # 機械処理用
//
// 判定は WCAG 2.1 の本文基準 4.5:1。コードは長時間読むものなので緩めない。
const fs = require('fs')
const path = require('path')
const {
  parseCssColor,
  compositeOver,
  contrastRatio
} = require('./contrast-util')

const CM_DIR = path.join(__dirname, '..', 'node_modules', 'codemirror')
const THEME_DIR = path.join(CM_DIR, 'theme')
const MIN_RATIO = 4.5

// 実際によく目に入るトークン。全部を並べても読めないので、
// 「コードを読むときに必ず出るもの」に絞る
const TOKENS = [
  'comment',
  'string',
  'string-2',
  'keyword',
  'number',
  'atom',
  'variable',
  'variable-2',
  'def',
  'property',
  'operator',
  'builtin',
  'meta',
  'tag',
  'attribute',
  'type'
]

/**
 * ざっくりした CSS ルール分解。宣言の中身と一緒に返す。
 * **コメントは先に落とす。** 残すと先頭のライセンスコメントが最初の
 * セレクタに貼り付き、完全一致の判定が静かに外れる
 */
function rules(css) {
  const out = []
  const re = /([^{}]+)\{([^}]*)\}/g
  css = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let m
  while ((m = re.exec(css)) !== null) {
    out.push({ selector: m[1].trim(), body: m[2] })
  }
  return out
}

function declaration(body, property) {
  // `color` は `background-color` に前方一致で巻き込まれる
  const m = body.match(
    new RegExp(`(?:^|[^-\\w])${property}\\s*:\\s*([^;!]+)`, 'i')
  )
  return m ? m[1].trim() : null
}

/**
 * テーマ1つ分の色を集める。
 * @returns {{background: object, foreground: object, tokens: object}}
 */
function collectTheme(css, themeName) {
  const scope = `.cm-s-${themeName}`
  let background = null
  let foreground = null
  const tokens = {}

  rules(css).forEach(({ selector, body }) => {
    if (!selector.includes(scope)) return

    // 背景は**ルート要素の規則だけ**から取る。`.CodeMirror` を含む規則を
    // 広く拾うと `div.CodeMirror-selected { background: #e0e0e0 }` 等に
    // 上書きされ、比が丸ごと嘘になる（実際 base16-light を 2.66 と誤測した）
    const isRoot = selector
      .split(',')
      .map(s => s.trim())
      .some(s => s === `${scope}.CodeMirror`)
    if (isRoot) {
      const bg = declaration(body, 'background')
      const bgc = declaration(body, 'background-color')
      const color = declaration(body, 'color')
      const parsed = parseCssColor((bgc || bg || '').split(/\s+/)[0])
      if (parsed && parsed.a >= 1) background = parsed
      const fg = parseCssColor(color)
      if (fg) foreground = fg
    }

    TOKENS.forEach(token => {
      // `.cm-string` は `.cm-string-2` に前方一致するので境界を見る
      if (!new RegExp(`\\.cm-${token}(?![\\w-])`).test(selector)) return
      const color = parseCssColor(declaration(body, 'color'))
      if (color) tokens[token] = color
    })
  })

  return { background, foreground, tokens }
}

function ratioOf(color, background) {
  if (!color || !background) return null
  const solid = color.a < 1 ? compositeOver(color, background) : color
  return contrastRatio(solid, background)
}

function measure(themeName, css) {
  const { background, foreground, tokens } = collectTheme(css, themeName)
  if (!background) return null

  const results = {}
  if (foreground) results.__text = ratioOf(foreground, background)
  Object.keys(tokens).forEach(token => {
    results[token] = ratioOf(tokens[token], background)
  })

  const measured = Object.keys(results).filter(k => results[k] != null)
  const failing = measured.filter(k => results[k] < MIN_RATIO)
  const worst = measured.reduce(
    (acc, k) => (acc === null || results[k] < results[acc] ? k : acc),
    null
  )

  return {
    theme: themeName,
    background: `rgb(${Math.round(background.r)}, ${Math.round(
      background.g
    )}, ${Math.round(background.b)})`,
    isDark: background.r + background.g + background.b < 384,
    measured: measured.length,
    failing: failing.length,
    failingTokens: failing.sort((a, b) => results[a] - results[b]),
    worstToken: worst,
    worstRatio: worst ? Math.round(results[worst] * 100) / 100 : null,
    ratios: measured.reduce((acc, k) => {
      acc[k] = Math.round(results[k] * 100) / 100
      return acc
    }, {})
  }
}

function collectAll() {
  const out = []
  // 既定テーマは codemirror.css の中（`.cm-s-default`）
  out.push(measureDefault())
  fs.readdirSync(THEME_DIR)
    .filter(f => f.endsWith('.css'))
    .forEach(file => {
      const name = file.replace(/\.css$/, '')
      const css = fs.readFileSync(path.join(THEME_DIR, file), 'utf8')
      const row = measure(name, css)
      if (row) out.push(row)
    })
  return out.filter(Boolean)
}

function measureDefault() {
  const css = fs.readFileSync(
    path.join(CM_DIR, 'lib', 'codemirror.css'),
    'utf8'
  )
  const row = measure('default', css)
  if (row) return row
  // 既定テーマは背景を .CodeMirror（テーマ非依存）で持つ
  const base = collectTheme(css, 'default')
  const background = parseCssColor('#ffffff')
  const results = {}
  Object.keys(base.tokens).forEach(token => {
    results[token] = ratioOf(base.tokens[token], background)
  })
  const measured = Object.keys(results)
  const failing = measured.filter(k => results[k] < MIN_RATIO)
  const worst = measured.reduce(
    (acc, k) => (acc === null || results[k] < results[acc] ? k : acc),
    null
  )
  return {
    theme: 'default',
    background: 'rgb(255, 255, 255)',
    isDark: false,
    measured: measured.length,
    failing: failing.length,
    failingTokens: failing.sort((a, b) => results[a] - results[b]),
    worstToken: worst,
    worstRatio: worst ? Math.round(results[worst] * 100) / 100 : null,
    ratios: measured.reduce((acc, k) => {
      acc[k] = Math.round(results[k] * 100) / 100
      return acc
    }, {})
  }
}

function main() {
  const args = process.argv.slice(2)
  const rowsAll = collectAll()

  if (args.includes('--json')) {
    console.log(JSON.stringify(rowsAll, null, 2))
    return
  }

  const rows = args.includes('--all')
    ? rowsAll
    : rowsAll.filter(r =>
        [
          'default',
          'base16-light',
          'base16-dark',
          'monokai',
          'dracula'
        ].includes(r.theme)
      )

  const sorted = rows
    .slice()
    .sort((a, b) => (b.worstRatio || 0) - (a.worstRatio || 0))

  console.log(`\nエディタテーマのコントラスト（基準 ${MIN_RATIO}:1）\n`)
  console.log(
    'theme'.padEnd(24) +
      'bg'.padEnd(6) +
      '測定'.padEnd(6) +
      '不足'.padEnd(6) +
      '最悪'
  )
  console.log('-'.repeat(72))
  sorted.forEach(r => {
    const mark = r.failing === 0 ? '✓' : ' '
    console.log(
      `${mark} ${r.theme}`.padEnd(24) +
        (r.isDark ? 'dark' : 'light').padEnd(6) +
        String(r.measured).padEnd(6) +
        String(r.failing).padEnd(6) +
        `${r.worstToken} ${r.worstRatio}`
    )
  })

  if (!args.includes('--all')) {
    console.log('\n不足しているトークン:')
    sorted.forEach(r => {
      if (!r.failing) return
      console.log(
        `  ${r.theme}: ` +
          r.failingTokens.map(t => `${t} ${r.ratios[t]}`).join(', ')
      )
    })
    console.log('\n（--all で全テーマ、--json で機械処理用）')
  }
}

if (require.main === module) main()

module.exports = { collectAll, measure, collectTheme, MIN_RATIO, TOKENS }

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

// solarized は `.cm-s-solarized.cm-s-light` / `.cm-s-dark` の組み合わせで
// 明暗を切り替える特殊な作り。アプリ側も 'solarized light' / 'solarized dark'
// の2エントリに分けている。単純な root 規則が無いので、ここでは測らない
const UNMEASURABLE = ['solarized']

/**
 * 背景を宣言しないテーマは、CodeMirror 既定(codemirror.css)の色の上に
 * 自分のトークン色だけを重ねている。**既定分も一緒に測らないと、
 * 「3トークンしか定義していないので不足0件」という嘘の合格が出る**
 */
function baseTokens() {
  if (baseTokens.cache) return baseTokens.cache
  const css = fs.readFileSync(
    path.join(CM_DIR, 'lib', 'codemirror.css'),
    'utf8'
  )
  baseTokens.cache = collectTheme(css, 'default').tokens
  return baseTokens.cache
}

function measure(themeName, css) {
  const { background, foreground, tokens } = collectTheme(css, themeName)
  if (!background && UNMEASURABLE.indexOf(themeName) !== -1) return null

  // 背景を宣言していないテーマは、CodeMirror 既定の白地・黒文字の上に
  // トークン色だけを載せている（eclipse / elegant / idea / neat 等）。
  // **測れないのではなく「白地」が答え**。捨てると集計が嘘になる
  const inheritsBase = !background
  const bg = background || parseCssColor('#ffffff')
  const fg = foreground || (inheritsBase ? parseCssColor('#000000') : null)
  // 既定を継承するテーマは、自分で塗っていないトークンに既定色が出る
  const effective = inheritsBase
    ? Object.assign({}, baseTokens(), tokens)
    : tokens

  const results = {}
  if (fg) results.__text = ratioOf(fg, bg)
  Object.keys(effective).forEach(token => {
    results[token] = ratioOf(effective[token], bg)
  })

  const measured = Object.keys(results).filter(k => results[k] != null)
  const failing = measured.filter(k => results[k] < MIN_RATIO)
  const worst = measured.reduce(
    (acc, k) => (acc === null || results[k] < results[acc] ? k : acc),
    null
  )

  return {
    theme: themeName,
    background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(
      bg.b
    )})`,
    inheritsBase,
    isDark: bg.r + bg.g + bg.b < 384,
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

// アプリはこの2つのディレクトリからテーマを拾う（consts.js と同じ）。
// 自前テーマを測れないと、作った当人が基準割れに気づけない
const EXTRA_THEME_DIR = path.join(
  __dirname,
  '..',
  'extra_scripts',
  'codemirror',
  'theme'
)

// 測れなかったテーマ。**黙って捨てると「54中10だけ合格」のような
// 集計そのものが嘘になる**ので、必ず数えて出す
const skipped = []

function collectAll() {
  const out = []
  skipped.length = 0
  // 既定テーマは codemirror.css の中（`.cm-s-default`）
  out.push(measureDefault())
  ;[THEME_DIR, EXTRA_THEME_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) return
    fs.readdirSync(dir)
      .filter(f => f.endsWith('.css'))
      .forEach(file => {
        const name = file.replace(/\.css$/, '')
        const css = fs.readFileSync(path.join(dir, file), 'utf8')
        const row = measure(name, css)
        if (row) out.push(row)
        else skipped.push(name)
      })
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
  if (skipped.length) {
    console.log(
      `\n測れなかったテーマ ${skipped.length} 件（背景の宣言が読めない）: ` +
        skipped.join(', ')
    )
  }
}

if (require.main === module) main()

module.exports = {
  collectAll,
  measure,
  collectTheme,
  skipped,
  MIN_RATIO,
  TOKENS
}

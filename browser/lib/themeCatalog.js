// エディタ／コードブロックのテーマ一覧を「選べる形」に整える。
//
// 同梱テーマは名前(3024-day, mbo, moxer, yonce ...)からは中身が想像できない。
// しかも実測すると、**測れた 68 テーマのうち全トークンが WCAG 2.1 の
// 本文基準 4.5:1 を満たすのは 11 個だけで、明るいテーマは1つも無い**
// （自前の theboosters-light が唯一の合格）。一覧をそのまま出すと、
// 選んでも読めない確率のほうが高い。
//
// そこで「推奨（実測合格）」を先頭に出し、残りは畳んだ扱いにする。
// 実測は `node dev-scripts/theme-contrast-report.js --all`。
// この表は測った結果の写しなので、**テーマを足したら測り直して更新する**
// （tests/lib/themeCatalog.test.js が写し間違いを検知する）。

// 自前テーマ。全トークン 4.5:1 以上を保証している（tests/lib/boostersThemes）
export const BOOSTERS_THEMES = ['theboosters-light', 'theboosters-dark']

// 同梱テーマのうち、実測で全トークンが基準を満たしたもの（すべて dark）。
// 背景を宣言しないテーマは CodeMirror 既定色を継承するので、その分も
// 合わせて測っている（測らないと「3色しか塗っていないので合格」になる）
export const MEASURED_CLEAN_THEMES = [
  'abcdef',
  'ayu-dark',
  'ayu-mirage',
  'blackboard',
  'mbo',
  'rubyblue',
  'shadowfox',
  'tomorrow-night-bright',
  'tomorrow-night-eighties',
  'vibrant-ink',
  'yonce'
]

export const RECOMMENDED_THEMES = BOOSTERS_THEMES.concat(MEASURED_CLEAN_THEMES)

// 名前から中身が分かるものだけ手当てする。残りは元の名前のまま出す
// （勝手な意訳を増やすと、元の名前で探している人が迷子になる）
const DISPLAY_NAMES = {
  'theboosters-light': 'The Boosters Light',
  'theboosters-dark': 'The Boosters Dark',
  default: 'Default',
  'base16-light': 'Base16 Light',
  'base16-dark': 'Base16 Dark',
  'solarized light': 'Solarized Light',
  'solarized dark': 'Solarized Dark',
  'tomorrow-night-bright': 'Tomorrow Night Bright',
  'tomorrow-night-eighties': 'Tomorrow Night Eighties',
  'ayu-dark': 'Ayu Dark',
  'ayu-mirage': 'Ayu Mirage',
  monokai: 'Monokai',
  dracula: 'Dracula',
  material: 'Material',
  nord: 'Nord'
}

/** 選択肢に出す名前 */
export function displayName(name) {
  return DISPLAY_NAMES[name] || name
}

export function isRecommended(name) {
  return RECOMMENDED_THEMES.indexOf(name) !== -1
}

/**
 * 一覧を「推奨」と「その他」に分ける。
 * 推奨は RECOMMENDED_THEMES の順（自前テーマが先頭）、その他は元の順。
 *
 * @param {Array<{name: string}>} themes consts.THEMES
 * @returns {{recommended: Array, others: Array}}
 */
export function groupThemes(themes) {
  const list = Array.isArray(themes) ? themes : []
  const recommended = RECOMMENDED_THEMES.map(name =>
    list.find(theme => theme.name === name)
  ).filter(Boolean)
  const recommendedNames = recommended.map(theme => theme.name)
  const others = list.filter(
    theme => recommendedNames.indexOf(theme.name) === -1
  )
  return { recommended, others }
}

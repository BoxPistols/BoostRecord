// エディタ（CodeMirror）テーマの明暗判定。
//
// UI テーマとエディタテーマは**別系統**で、既定値もそれぞれ独立している
// （UI=default / エディタ=base16-light）。UI だけをダークにすると、
// エディタのペインだけが白い柱として残る。
//
// 判定と既定値をここ1箇所に置く。環境設定側と読み込み時の移行の2箇所で
// 同じ表を持つと、片方だけ更新して「設定画面では揃うのに再起動で戻る」
// という形でずれる。
//
// electron を require しないので単体テストできる。

// 既定は自前テーマ。実測すると、測れた 68 テーマのうち全トークンが
// WCAG 2.1 の本文基準 4.5:1 を満たすのは 11 個だけで、**同梱の明るいテーマは
// 1つも通らない**（旧既定の base16-light は文字列が 1.53 でほぼ読めない）。
// 実測は node dev-scripts/theme-contrast-report.js --all
export const DEFAULT_LIGHT_EDITOR_THEME = 'theboosters-light'
export const DEFAULT_DARK_EDITOR_THEME = 'theboosters-dark'

// 旧既定の light。**利用者が選んだのではなく、こちらが入れていた値**で、
// かつ実測で壊れている（文字列 1.53）ので移行する。
// 旧既定の dark(monokai) は移行しない。コメントは 4.58 で基準を満たしており、
// 自分で選んだ人と区別が付かない以上、動かさないほうが害が少ない
const LEGACY_BROKEN_DEFAULT = 'base16-light'

// 一覧に無いものは light 扱い。CodeMirror のテーマは追加されうるので、
// 「暗いものを列挙する」向きにしておく（未知を暗いと誤判定すると、
// 明るい UI に暗いエディタを合わせてしまう）
export const DARK_EDITOR_THEMES = [
  '3024-night',
  'abcdef',
  'ambiance',
  'ayu-dark',
  'ayu-mirage',
  'base16-dark',
  'bespin',
  'blackboard',
  'cobalt',
  'colorforth',
  'darcula',
  'dracula',
  'duotone-dark',
  'erlang-dark',
  'gruvbox-dark',
  'hopscotch',
  'icecoder',
  'isotope',
  'lesser-dark',
  'liquibyte',
  'lucario',
  'material',
  'material-darker',
  'material-ocean',
  'material-palenight',
  'mbo',
  'mdn-like',
  'midnight',
  'monokai',
  'moxer',
  'night',
  'nord',
  'oceanic-next',
  'panda-syntax',
  'paraiso-dark',
  'pastel-on-dark',
  'railscasts',
  'rubyblue',
  'seti',
  'shadowfox',
  'solarized dark',
  'the-matrix',
  'theboosters-dark',
  'tomorrow-night-bright',
  'tomorrow-night-eighties',
  'twilight',
  'vibrant-ink',
  'xq-dark',
  'yonce',
  'zenburn'
]

export function isDarkEditorTheme(name) {
  return DARK_EDITOR_THEMES.indexOf(name) !== -1
}

/**
 * UI の明暗に合わせたエディタテーマ。
 *
 * **明暗が一致しているものは変えない**。ダーク UI に dracula を選んでいる、
 * のような意図した組み合わせを潰さないため。
 *
 * @param {boolean} uiIsDark
 * @param {string} editorTheme 現在のエディタテーマ
 * @returns {string} 揃えた後のテーマ（変更不要なら同じ値）
 */
export function coupleEditorTheme(uiIsDark, editorTheme) {
  const editorIsDark = isDarkEditorTheme(editorTheme)
  if (uiIsDark && !editorIsDark) return DEFAULT_DARK_EDITOR_THEME
  if (!uiIsDark && editorIsDark) return DEFAULT_LIGHT_EDITOR_THEME
  return editorTheme
}

/**
 * 読み込み時の移行。
 *
 * 明暗の連動は環境設定の Interface タブを**保存した時にだけ**走るので、
 * それ以前にダークへ切り替えた利用者は `editor.theme` が既定の
 * base16-light のまま残り、エディタだけが白い柱になる。
 *
 * ただし**既定値のままの人だけ**を対象にする。自分で選んだテーマを
 * 起動のたびに書き換えられると、設定した意味が無くなる。
 *
 * @param {boolean} uiIsDark
 * @param {string} editorTheme
 * @param {boolean} [migrated] 旧既定からの移行を済ませたか
 * @returns {string}
 */
export function migrateUntouchedEditorTheme(uiIsDark, editorTheme, migrated) {
  // 壊れている旧既定(base16-light)だけは、明暗どちらでも自前テーマへ移す。
  // **一度だけ。** 毎回書き換えると、base16-light を自分で選び直した人が
  // 起動のたびに奪われ、その設定に戻す手段が無くなる
  if (!migrated && editorTheme === LEGACY_BROKEN_DEFAULT) {
    return uiIsDark ? DEFAULT_DARK_EDITOR_THEME : DEFAULT_LIGHT_EDITOR_THEME
  }
  if (!uiIsDark) return editorTheme
  if (editorTheme !== DEFAULT_LIGHT_EDITOR_THEME) return editorTheme
  return DEFAULT_DARK_EDITOR_THEME
}

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

export const DEFAULT_LIGHT_EDITOR_THEME = 'base16-light'
export const DEFAULT_DARK_EDITOR_THEME = 'monokai'

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
 * @returns {string}
 */
export function migrateUntouchedEditorTheme(uiIsDark, editorTheme) {
  if (!uiIsDark) return editorTheme
  if (editorTheme !== DEFAULT_LIGHT_EDITOR_THEME) return editorTheme
  return DEFAULT_DARK_EDITOR_THEME
}

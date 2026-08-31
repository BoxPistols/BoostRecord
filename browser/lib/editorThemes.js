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
  'abbott',
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
  'rockabilly',
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
 * 環境設定を保存する時に、実際に採用するエディタテーマを決める。
 *
 * coupleEditorTheme() は「UI をダークにしたらエディタも暗くする」ための仕組みで、
 * **保存のたびに無条件で走らせてはいけない**。無条件だと、暗い UI のまま明るい
 * エディタテーマを選んでも保存時に暗いテーマへ書き戻され、選択肢が押しても
 * 効かないコントロールになる（実機で Default を選ぶと monokai に戻っていた）。
 *
 * エディタのテーマを選び直した時はその選択を通し、UI テーマだけを変えた時に
 * 明暗を揃える。
 *
 * @param {boolean} uiIsDark 保存しようとしている UI テーマが暗いか
 * @param {string} selected エディタテーマの選択値
 * @param {string} previous 直前に保存されていたエディタテーマ（解決後の名前）
 * @returns {string}
 */
export function applyEditorThemeChoice(uiIsDark, selected, previous) {
  if (selected !== previous) return selected
  return coupleEditorTheme(uiIsDark, selected)
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

// ---------------------------------------------------------------------------
// 選択肢の絞り込み
//
// CodeMirror が同梱するテーマは 60 種以上あり、背景がほとんど同じものが並ぶ。
// 選ぶ側からは違いが分からないので、色の系統ごとに代表を 1 つ残す。
//
// **保存済みの設定は書き換えない。** 一覧から外れたテーマを選んでいた人の
// config はそのまま残し、使う時に resolveEditorTheme() で代表へ寄せるだけに
// する。あとで一覧を戻せば元の選択がそのまま復活する。設定を書き換える実装に
// すると、読み込んだだけで利用者の選択が消える。

export const CURATED_EDITOR_THEMES = [
  // 暗いテーマ。note は i18n のキーなので英語で持つ（訳は locales/ 側）
  {
    name: 'rockabilly',
    label: 'Rockabilly',
    group: 'dark',
    note: 'Charcoal + vermilion (BoostRecord original)'
  },
  {
    name: 'monokai',
    label: 'Monokai',
    group: 'dark',
    note: 'Black + high-saturation neon'
  },
  {
    name: 'dracula',
    label: 'Dracula',
    group: 'dark',
    note: 'Navy purple + pastel'
  },
  {
    name: 'nord',
    label: 'Nord',
    group: 'dark',
    note: 'Blue gray + low-saturation cool tones'
  },
  {
    name: 'material',
    label: 'Material',
    group: 'dark',
    note: 'Deep blue green + cyan'
  },
  {
    name: 'solarized dark',
    label: 'Solarized Dark',
    group: 'dark',
    note: 'Teal + muted cool tones'
  },
  {
    name: 'gruvbox-dark',
    label: 'Gruvbox Dark',
    group: 'dark',
    note: 'Warm dark + orange'
  },
  {
    name: 'zenburn',
    label: 'Zenburn',
    group: 'dark',
    note: 'Gray green + low contrast'
  },
  // 明るいテーマ
  {
    name: 'default',
    label: 'Default',
    group: 'light',
    note: 'Plain white (CodeMirror default)'
  },
  {
    name: 'base16-light',
    label: 'Base16 Light',
    group: 'light',
    note: 'Light gray + muted colors'
  },
  {
    name: 'solarized light',
    label: 'Solarized Light',
    group: 'light',
    note: 'Cream + muted cool tones'
  },
  {
    name: 'paraiso-light',
    label: 'Paraiso Light',
    group: 'light',
    note: 'Gray-green light + magenta'
  }
]

export const CURATED_EDITOR_THEME_NAMES = CURATED_EDITOR_THEMES.map(t => t.name)

// 一覧から外したテーマ -> 寄せる先。背景色の距離（CIE Lab）で機械的に割り当て、
// 系統が違うものだけ手で直した。明暗は必ず保つ（tests/lib/editorThemes.test.js）
export const EDITOR_THEME_ALIASES = {
  '3024-day': 'base16-light',
  '3024-night': 'monokai',
  abbott: 'gruvbox-dark',
  abcdef: 'rockabilly',
  ambiance: 'rockabilly',
  'ambiance-mobile': 'default',
  'ayu-dark': 'nord',
  'ayu-mirage': 'nord',
  'base16-dark': 'monokai',
  bespin: 'gruvbox-dark',
  blackboard: 'rockabilly',
  cobalt: 'dracula',
  colorforth: 'rockabilly',
  darcula: 'gruvbox-dark',
  'duotone-dark': 'dracula',
  'duotone-light': 'solarized light',
  eclipse: 'default',
  elegant: 'default',
  'erlang-dark': 'dracula',
  hopscotch: 'dracula',
  icecoder: 'rockabilly',
  idea: 'default',
  isotope: 'rockabilly',
  juejin: 'base16-light',
  'lesser-dark': 'gruvbox-dark',
  liquibyte: 'rockabilly',
  lucario: 'nord',
  'material-darker': 'material',
  'material-ocean': 'material',
  'material-palenight': 'material',
  mbo: 'gruvbox-dark',
  'mdn-like': 'default',
  midnight: 'dracula',
  moxer: 'rockabilly',
  neat: 'default',
  neo: 'default',
  night: 'dracula',
  'oceanic-next': 'material',
  'panda-syntax': 'gruvbox-dark',
  'paraiso-dark': 'dracula',
  'pastel-on-dark': 'gruvbox-dark',
  railscasts: 'gruvbox-dark',
  rubyblue: 'dracula',
  seti: 'rockabilly',
  shadowfox: 'gruvbox-dark',
  ssms: 'default',
  'the-matrix': 'rockabilly',
  'tomorrow-night-bright': 'rockabilly',
  'tomorrow-night-eighties': 'rockabilly',
  ttcn: 'default',
  twilight: 'rockabilly',
  'vibrant-ink': 'rockabilly',
  'xq-dark': 'dracula',
  'xq-light': 'default',
  yeti: 'base16-light',
  yonce: 'rockabilly'
}

/**
 * 保存されているテーマ名を、実際に使う名前へ解決する。
 *
 * 一覧に残っているものはそのまま返す。外したものは代表へ寄せる。
 * どちらでもない（将来 CodeMirror が足したもの・手で書き換えられた設定）は
 * 明暗だけ合わせて既定へ落とす。
 *
 * @param {string} name 保存されている名前
 * @returns {string} 実際に使う名前（必ず一覧に載っているもの）
 */
export function resolveEditorTheme(name) {
  if (CURATED_EDITOR_THEME_NAMES.indexOf(name) !== -1) return name
  const alias = EDITOR_THEME_ALIASES[name]
  if (alias) return alias
  return isDarkEditorTheme(name)
    ? DEFAULT_DARK_EDITOR_THEME
    : DEFAULT_LIGHT_EDITOR_THEME
}

// ---------------------------------------------------------------------------
// プレビューのコードブロック（preview.codeBlockTheme）
//
// エディタのテーマとは別系統で、既定値も別（'default' = CodeMirror 素の白）。
// エディタ側だけを連動させていたので、UI をダークにしてもプレビューの
// コードブロックだけが白い箱として残っていた。

export const DEFAULT_LIGHT_CODE_BLOCK_THEME = 'default'

/**
 * 読み込み時の移行。
 *
 * 既定値のままの人だけを対象にする（自分で明るいテーマを選んだ人の設定は
 * 触らない）。寄せ先はエディタのテーマに合わせる。プレビューとエディタで
 * 別々の配色が並ぶより、同じ見た目になる方が読みやすい。
 *
 * @param {boolean} uiIsDark
 * @param {string} codeBlockTheme 現在の preview.codeBlockTheme
 * @param {string} editorTheme 現在の editor.theme（解決前でよい）
 * @returns {string}
 */
export function migrateUntouchedCodeBlockTheme(
  uiIsDark,
  codeBlockTheme,
  editorTheme
) {
  if (!uiIsDark) return codeBlockTheme
  if (codeBlockTheme !== DEFAULT_LIGHT_CODE_BLOCK_THEME) return codeBlockTheme
  const resolvedEditor = resolveEditorTheme(editorTheme)
  return isDarkEditorTheme(resolvedEditor)
    ? resolvedEditor
    : DEFAULT_DARK_EDITOR_THEME
}

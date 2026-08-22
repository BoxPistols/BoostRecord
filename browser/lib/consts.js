const path = require('path')
const remote = require('@electron/remote')
const { buildEditorThemes } = require('./editorThemeFiles')
const { app } = remote

const CODEMIRROR_THEME_PATH = 'node_modules/codemirror/theme'
const CODEMIRROR_EXTRA_THEME_PATH = 'extra_scripts/codemirror/theme'

const isProduction = process.env.NODE_ENV === 'production'

// 先に書いた方が優先。同梱テーマを extra 側の同名ファイルで上書きしない
// （古くなった手元のコピーが本家版を黙って隠すため。nord がそうなっていた）
const paths = [
  isProduction
    ? path.join(app.getAppPath(), CODEMIRROR_THEME_PATH)
    : path.resolve(CODEMIRROR_THEME_PATH),
  isProduction
    ? path.join(app.getAppPath(), CODEMIRROR_EXTRA_THEME_PATH)
    : path.resolve(CODEMIRROR_EXTRA_THEME_PATH)
]

// 一覧の組み立ては editorThemeFiles.js（electron 非依存・単体テストあり）。
// 同名の重複を畳み、専用クラスを持たない補助ファイルを外し、default には
// 読み込むファイルを持たせない
const themes = buildEditorThemes({ dirs: paths })

const snippetFile =
  process.env.NODE_ENV !== 'test'
    ? path.join(app.getPath('userData'), 'snippets.json')
    : '' // return nothing as we specified different path to snippets.json in test

const consts = {
  // 12 色。既存の 7 色は値も並び順もそのまま残し、隙間の色相を足している
  // （既にフォルダへ設定済みの色が選択肢から消えないようにするため）
  FOLDER_COLORS: [
    '#E10051',
    '#FF6B35',
    '#FF8E00',
    '#E8D252',
    '#A8C93A',
    '#3FD941',
    '#30D5C8',
    '#2BA5F7',
    '#4C6EF5',
    '#7C4DFF',
    '#B013A4',
    '#8D8D93'
  ],
  FOLDER_COLOR_NAMES: [
    'Razzmatazz (Red)',
    'Flamingo (Coral)',
    'Pizazz (Orange)',
    'Confetti (Yellow)',
    'Olive (Lime)',
    'Emerald (Green)',
    'Turquoise',
    'Dodger Blue',
    'Indigo',
    'Amethyst (Purple)',
    'Violet Eggplant',
    'Slate (Gray)'
  ],
  THEMES: themes,
  SNIPPET_FILE: snippetFile,
  DEFAULT_EDITOR_FONT_FAMILY: [
    'Monaco',
    'Menlo',
    'Ubuntu Mono',
    'Consolas',
    'source-code-pro',
    'monospace'
  ]
}

module.exports = consts

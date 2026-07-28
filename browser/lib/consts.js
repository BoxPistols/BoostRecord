const path = require('path')
const fs = require('sander')
const remote = require('@electron/remote')
const { app } = remote

const CODEMIRROR_THEME_PATH = 'node_modules/codemirror/theme'
const CODEMIRROR_EXTRA_THEME_PATH = 'extra_scripts/codemirror/theme'

const isProduction = process.env.NODE_ENV === 'production'

const paths = [
  isProduction
    ? path.join(app.getAppPath(), CODEMIRROR_THEME_PATH)
    : path.resolve(CODEMIRROR_THEME_PATH),
  isProduction
    ? path.join(app.getAppPath(), CODEMIRROR_EXTRA_THEME_PATH)
    : path.resolve(CODEMIRROR_EXTRA_THEME_PATH)
]

const themes = paths
  .map(directory =>
    fs.readdirSync(directory).map(file => {
      const name = file.substring(0, file.lastIndexOf('.'))

      return {
        name,
        path: path.join(directory, file),
        className: `cm-s-${name}`
      }
    })
  )
  .reduce((accumulator, value) => accumulator.concat(value), [])
  .sort((a, b) => a.name.localeCompare(b.name))

themes.splice(
  themes.findIndex(({ name }) => name === 'solarized'),
  1,
  {
    name: 'solarized dark',
    path: path.join(paths[0], 'solarized.css'),
    className: `cm-s-solarized cm-s-dark`
  },
  {
    name: 'solarized light',
    path: path.join(paths[0], 'solarized.css'),
    className: `cm-s-solarized cm-s-light`
  }
)
themes.splice(0, 0, {
  name: 'default',
  path: path.join(paths[0], 'elegant.css'),
  className: `cm-s-default`
})

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

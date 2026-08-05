import _ from 'lodash'
import RcParser from 'browser/lib/RcParser'
import i18n from 'browser/lib/i18n'
import ee from 'browser/main/lib/eventEmitter'
import { DEFAULT_MODELS, normalizeAiModels } from 'browser/main/lib/aiModels'
import {
  EXPANDED,
  resolveSideNavMode,
  isFoldedFor
} from 'browser/main/lib/sideNavMode'

const OSX = global.process.platform === 'darwin'
const win = global.process.platform === 'win32'
const electron = require('electron')
const { ipcRenderer } = electron
const consts = require('browser/lib/consts')
const electronConfig = new (require('electron-config'))()

let isInitialized = false

const DEFAULT_MARKDOWN_LINT_CONFIG = `{
  "default": true
}`

const DEFAULT_CSS_CONFIG = `
/* Drop Your Custom CSS Code Here */
[data-theme="default"] p code.inline,
[data-theme="default"] li code.inline,
[data-theme="default"] td code.inline
{
  padding: 2px;
  border-width: 1px;
  border-style: solid;
  border-radius: 5px;
  background-color: #F4F4F4;
  border-color: #d9d9d9;
  color: #03C588;
}
`

export const DEFAULT_CONFIG = {
  zoom: 1,
  // 旧 boolean。sideNavMode から導出した値を必ず同時に入れる
  // （まだ boolean を見ている参照が残っているため）
  isSideNavFolded: false,
  // サイドバーの表示モード: EXPANDED | FOLDED | HIDDEN。
  // Cmd+B がこの順で巡回する。validate() には足さない
  // （既存の設定ファイルに無いキーを必須にすると全部無効判定になる）
  sideNavMode: EXPANDED,
  // ノート一覧ペインの折りたたみ。既存の設定ファイルにはこのキーが無いので
  // validate() では必須にしない（必須にすると既存ユーザーの設定が全て無効に
  // 判定され、初期値へ巻き戻る）
  isNoteListFolded: false,
  // 折りたたみ時の幅。0 にせず残すのは何のペインか分かるようにするため。
  // 畳んだ状態でもドラッグで微調整できるので、その結果をここに保存する
  foldedListWidth: 100,
  listWidth: 280,
  navWidth: 200,
  sortBy: {
    default: 'UPDATED_AT' // 'CREATED_AT', 'UPDATED_AT', 'APLHABETICAL'
  },
  sortTagsBy: 'ALPHABETICAL', // 'ALPHABETICAL', 'COUNTER'
  listStyle: 'DEFAULT', // 'DEFAULT', 'SMALL'
  listDirection: 'ASCENDING', // 'ASCENDING', 'DESCENDING'
  autoUpdateEnabled: true,
  hotkey: {
    // 既定値は実際に使われている組み合わせに合わせた。
    // Alt/Option を含む組み合わせは Mac で取りこぼすため使わない。
    toggleMain: OSX ? 'Command + Alt + L' : 'Ctrl + Alt + L',
    toggleMode: OSX ? 'Command + Shift + E' : 'Ctrl + Shift + E',
    togglePreview: OSX ? 'Command + E' : 'Ctrl + E',
    // 旧既定の Command + Alt + Right は効かなかった。Mac の Option は
    // 文字変換に使われ、Alt を含む組み合わせは取りこぼす
    toggleDirection: OSX ? 'Command + Shift + D' : 'Ctrl + Shift + D',
    deleteNote: OSX
      ? 'Command + Shift + Backspace'
      : 'Ctrl + Shift + Backspace',
    pasteSmartly: OSX ? 'Command + Shift + V' : 'Ctrl + Shift + V',
    prettifyMarkdown: OSX ? 'Command + Shift + F' : 'Ctrl + Shift + F',
    sortLines: OSX ? 'Command + Shift + S' : 'Ctrl + Shift + S',
    insertDate: OSX ? 'Command + /' : 'Ctrl + /',
    insertDateTime: OSX ? 'Command + Alt + /' : 'Ctrl + Shift + /',
    // 旧既定の 'Alt' は単独の修飾キーで、Mousetrap は組み合わせとして
    // 束ねられない（実キーが要る）。M = Menu
    toggleMenuBar: OSX ? 'Command + Shift + M' : 'Ctrl + Shift + M',
    // ノート一覧ペインの開閉。Command + B（サイドバー）の対
    toggleNoteList: OSX ? 'Command + Shift + B' : 'Ctrl + Shift + B',
    // 情報パネル。Command + Alt + I は DevTools と衝突するので使わない
    toggleInfo: OSX ? 'Command + Shift + I' : 'Ctrl + Shift + I',
    // ノートリンクへ直接フォーカスしてクリップボードへコピーする
    // Command + Ctrl の組み合わせは Mousetrap で成立しないことを実測で確認した
    // （バインドはされるが keydown と一致せず発火しない）。
    // Shift + L は「表示／非表示」と重なるので C = Copy を使う
    // （HTMLで貼り付け = Shift + V と対になる）
    focusNoteLink: OSX ? 'Command + Shift + C' : 'Ctrl + Shift + C',
    // 目次ペインの表示切替。Command + Shift + O（Outline）
    toggleToc: OSX ? 'Command + Shift + O' : 'Ctrl + Shift + O'
  },
  ui: {
    language: 'ja',
    theme: 'default',
    defaultTheme: 'default',
    enableScheduleTheme: false,
    scheduledTheme: 'monokai',
    scheduleStart: 1200,
    scheduleEnd: 360,
    showCopyNotification: true,
    disableDirectWrite: false,
    showScrollBar: true,
    defaultNote: 'ALWAYS_ASK', // 'ALWAYS_ASK', 'SNIPPET_NOTE', 'MARKDOWN_NOTE'
    showMenuBar: false,
    isStacking: false
  },
  editor: {
    theme: 'base16-light',
    keyMap: 'sublime',
    fontSize: '14',
    fontFamily: win ? 'Consolas' : 'Monaco',
    indentType: 'space',
    indentSize: '2',
    lineWrapping: true,
    enableRulers: false,
    rulers: [80, 120],
    displayLineNumbers: true,
    matchingPairs: '()[]{}\'\'""$$**``~~__',
    matchingCloseBefore: ')]}\'":;>',
    matchingTriples: '```"""\'\'\'',
    explodingPairs: '[]{}``$$',
    codeBlockMatchingPairs: '()[]{}\'\'""``',
    codeBlockMatchingCloseBefore: ')]}\'":;>',
    codeBlockMatchingTriples: '',
    codeBlockExplodingPairs: '[]{}``',
    switchPreview: 'BLUR', // 'BLUR', 'DBL_CLICK', 'RIGHTCLICK'
    // 未設定だと新規スニペットの mode が undefined になり、null(Auto Detect)
    // と挙動がずれる。既定を明示して揃える
    snippetDefaultLanguage: 'Auto Detect',
    delfaultStatus: 'PREVIEW', // 'PREVIEW', 'CODE'
    scrollPastEnd: false,
    type: 'SPLIT', // 'SPLIT', 'EDITOR_PREVIEW'
    fetchUrlTitle: true,
    enableTableEditor: false,
    enableFrontMatterTitle: true,
    frontMatterTitleField: 'title',
    spellcheck: false,
    enableSmartPaste: false,
    enableMarkdownLint: false,
    customMarkdownLintConfig: DEFAULT_MARKDOWN_LINT_CONFIG,
    dateFormatISO8601: false,
    prettierConfig: `{
      "trailingComma": "es5",
      "tabWidth": 2,
      "semi": false,
      "singleQuote": true
    }`,
    deleteUnusedAttachments: true,
    rtlEnabled: false
  },
  preview: {
    fontSize: '14',
    fontFamily: win ? 'Segoe UI' : 'Lato',
    codeBlockTheme: 'dracula',
    lineNumber: true,
    latexInlineOpen: '$',
    latexInlineClose: '$',
    latexBlockOpen: '$$',
    latexBlockClose: '$$',
    plantUMLServerAddress: 'http://www.plantuml.com/plantuml',
    scrollPastEnd: false,
    scrollSync: true,
    smartQuotes: true,
    breaks: true,
    smartArrows: false,
    allowCustomCSS: false,
    customCSS: DEFAULT_CSS_CONFIG,
    sanitize: 'STRICT', // 'STRICT', 'ALLOW_STYLES', 'NONE'
    mermaidHTMLLabel: false,
    lineThroughCheckbox: true,
    // 目次（ページ内リンク）ペイン。validate() には足さない
    // （既存の設定ファイルに無いキーを必須にすると初期値へ巻き戻る）
    showToc: true,
    tocMinLevel: 1,
    tocMaxLevel: 3,
    // 目次ペインの幅（ドラッグで変更 → ここに保存）
    tocWidth: 200
  },
  export: {
    metadata: 'DONT_EXPORT', // 'DONT_EXPORT', 'MERGE_HEADER', 'MERGE_VARIABLE'
    variable: 'boostnote',
    prefixAttachmentFolder: false
  },
  coloredTags: {},
  // 既定モデルは aiModels の一覧から取る。ここに ID を直書きすると
  // モデル更新のたびに片方だけ古いまま残る
  ai: {
    provider: 'openai', // 'openai' | 'gemini'
    openai: { apiKey: '', model: DEFAULT_MODELS.openai },
    gemini: { apiKey: '', model: DEFAULT_MODELS.gemini }
  }
}

function validate(config) {
  if (!_.isObject(config)) return false
  if (!_.isNumber(config.zoom) || config.zoom < 0) return false
  if (!_.isBoolean(config.isSideNavFolded)) return false
  if (!_.isNumber(config.listWidth) || config.listWidth <= 0) return false

  return true
}

function _save(config) {
  window.localStorage.setItem('config', JSON.stringify(config))
}

// Object.assign は浅いので、保存済みの hotkey / ui / editor などが既定値の
// オブジェクトを丸ごと置き換えてしまい、**新しく足したキーが既存ユーザーへ
// 一切届かない**（設定画面に項目が出ず、ショートカットも登録されない）。
// 入れ子のプレーンオブジェクトは1段だけ既定値とマージする。
function mergeWithDefaults(defaults, stored) {
  const merged = Object.assign({}, defaults, stored)
  Object.keys(defaults).forEach(key => {
    const d = defaults[key]
    const v = stored && stored[key]
    const isPlain = o => o && typeof o === 'object' && !Array.isArray(o)
    if (isPlain(d) && isPlain(v)) {
      merged[key] = Object.assign({}, d, v)
    }
  })
  return merged
}

// 一時期の既定値が空文字だったため、保存済み設定に「未割り当て」が
// 残っている。空文字は利用者が意図して外したのか判別できないが、
// 既定値が入っている項目については埋め直す方が実害が小さい
function fillEmptyHotkeys(config) {
  if (!config || !config.hotkey) return config
  const filled = Object.assign({}, config.hotkey)
  Object.keys(DEFAULT_CONFIG.hotkey).forEach(key => {
    const isEmpty = filled[key] === '' || filled[key] == null
    if (isEmpty && DEFAULT_CONFIG.hotkey[key]) {
      filled[key] = DEFAULT_CONFIG.hotkey[key]
    }
  })
  return Object.assign({}, config, { hotkey: filled })
}

function get() {
  const rawStoredConfig = window.localStorage.getItem('config')
  const parsed = JSON.parse(rawStoredConfig)
  let storedConfig = fillEmptyHotkeys(mergeWithDefaults(DEFAULT_CONFIG, parsed))

  // sideNavMode を持たない古い設定は旧 boolean から導く。merge 後だと既定の
  // EXPANDED で埋まってしまい、畳んで使っていた人の状態が毎回戻るので、
  // マージ前の生データを見る。isSideNavFolded は常に導出値で揃える
  // （まだ boolean を見ている参照が残っている）
  const sideNavMode = resolveSideNavMode(parsed)
  storedConfig = Object.assign({}, storedConfig, {
    sideNavMode,
    isSideNavFolded: isFoldedFor(sideNavMode)
  })

  // 廃止したモデル ID（gpt-5-mini 等）が保存されたままだと API 呼び出しが
  // 失敗し続けるので、提供中の一覧に無い ID は既定へ寄せて保存し直す。
  // 一度書き戻せば以降は一致するので、実質「起動時に1回」で終わる。
  // .boostnoterc 由来の値は下の assignConfigValues で後から重なるため
  // ここでは触らない（明示指定の逃げ道を潰さない）
  const migratedAi = normalizeAiModels(storedConfig.ai)
  if (migratedAi !== storedConfig.ai) {
    storedConfig = Object.assign({}, storedConfig, { ai: migratedAi })
    _save(storedConfig)
  }

  let config = storedConfig

  try {
    const boostnotercConfig = RcParser.parse()
    config = assignConfigValues(storedConfig, boostnotercConfig)

    if (!validate(config)) throw new Error('INVALID CONFIG')
  } catch (err) {
    console.warn('The Boosters resets the invalid configuration.')
    config = DEFAULT_CONFIG
    _save(config)
  }

  config.autoUpdateEnabled = electronConfig.get(
    'autoUpdateEnabled',
    config.autoUpdateEnabled
  )

  if (!isInitialized) {
    isInitialized = true
    let editorTheme = document.getElementById('editorTheme')
    if (editorTheme == null) {
      editorTheme = document.createElement('link')
      editorTheme.setAttribute('id', 'editorTheme')
      editorTheme.setAttribute('rel', 'stylesheet')
      document.head.appendChild(editorTheme)
    }

    const theme = consts.THEMES.find(
      theme => theme.name === config.editor.theme
    )

    if (theme) {
      editorTheme.setAttribute('href', theme.path)
    } else {
      config.editor.theme = 'default'
    }
  }

  return config
}

function set(updates) {
  const currentConfig = get()

  const arrangedUpdates = updates
  if (updates.preview !== undefined && updates.preview.customCSS === '') {
    arrangedUpdates.preview.customCSS = DEFAULT_CONFIG.preview.customCSS
  }

  const newConfig = mergeWithDefaults(
    mergeWithDefaults(DEFAULT_CONFIG, currentConfig),
    arrangedUpdates
  )
  if (!validate(newConfig)) throw new Error('INVALID CONFIG')
  _save(newConfig)

  i18n.setLocale(newConfig.ui.language)

  let editorTheme = document.getElementById('editorTheme')
  if (editorTheme == null) {
    editorTheme = document.createElement('link')
    editorTheme.setAttribute('id', 'editorTheme')
    editorTheme.setAttribute('rel', 'stylesheet')
    document.head.appendChild(editorTheme)
  }

  const newTheme = consts.THEMES.find(
    theme => theme.name === newConfig.editor.theme
  )

  if (newTheme) {
    editorTheme.setAttribute('href', newTheme.path)
  }

  electronConfig.set('autoUpdateEnabled', newConfig.autoUpdateEnabled)

  ipcRenderer.send('config-renew', {
    config: get()
  })
  ee.emit('config-renew')
}

function assignConfigValues(originalConfig, rcConfig) {
  const config = Object.assign({}, DEFAULT_CONFIG, originalConfig, rcConfig)
  config.hotkey = Object.assign(
    {},
    DEFAULT_CONFIG.hotkey,
    originalConfig.hotkey,
    rcConfig.hotkey
  )
  config.ui = Object.assign(
    {},
    DEFAULT_CONFIG.ui,
    originalConfig.ui,
    rcConfig.ui
  )
  config.editor = Object.assign(
    {},
    DEFAULT_CONFIG.editor,
    originalConfig.editor,
    rcConfig.editor
  )
  config.preview = Object.assign(
    {},
    DEFAULT_CONFIG.preview,
    originalConfig.preview,
    rcConfig.preview
  )
  config.ai = Object.assign(
    {},
    DEFAULT_CONFIG.ai,
    originalConfig.ai,
    rcConfig.ai
  )

  rewriteHotkey(config)

  return config
}

function rewriteHotkey(config) {
  const keys = [...Object.keys(config.hotkey)]
  keys.forEach(key => {
    config.hotkey[key] = config.hotkey[key].replace(/Cmd\s/g, 'Command ')
    config.hotkey[key] = config.hotkey[key].replace(/Opt\s/g, 'Option ')
  })
  return config
}

export default {
  get,
  set,
  validate
}

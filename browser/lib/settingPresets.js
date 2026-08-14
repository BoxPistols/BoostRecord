// 目的ベースの設定プリセット。
//
// 環境設定は縦に長く、テーマだけでも3か所（インターフェース／エディタ／
// コードブロック）に散っている。「どう使いたいか」から入れれば、
// 個々の項目を理解しなくても妥当な組み合わせに着地できる。
//
// 触るのは**見え方に関わる項目だけ**。ストレージ・ホットキー・AI などは
// 触らない（プリセットで壊れると原因が分からなくなる）。
// 値はすべて ConfigManager の DEFAULT_CONFIG に実在するキーであること。

import i18n from 'browser/lib/i18n'
import {
  DEFAULT_LIGHT_EDITOR_THEME,
  DEFAULT_DARK_EDITOR_THEME
} from 'browser/lib/editorThemes'

/**
 * @typedef {{id: string, label: string, description: string,
 *            ui: object, editor: object, preview: object}} Preset
 */

/** 一覧。表示名は呼び出し時に翻訳する（起動時に固めると言語切替で古くなる） */
export function getPresets() {
  return [
    {
      id: 'readable-light',
      label: i18n.__('Readable (Light)'),
      description: i18n.__(
        'Light interface with the high-contrast editor theme. Every syntax color is measured at 4.5:1 or better.'
      ),
      ui: { theme: 'default', defaultTheme: 'default' },
      editor: {
        theme: DEFAULT_LIGHT_EDITOR_THEME,
        fontSize: '15',
        displayLineNumbers: true
      },
      preview: { fontSize: '15', codeBlockTheme: DEFAULT_LIGHT_EDITOR_THEME }
    },
    {
      id: 'readable-dark',
      label: i18n.__('Readable (Dark)'),
      description: i18n.__(
        'Dark interface with the high-contrast editor theme. Comments stay readable, which most dark themes fail at.'
      ),
      ui: { theme: 'dark', defaultTheme: 'dark' },
      editor: {
        theme: DEFAULT_DARK_EDITOR_THEME,
        fontSize: '15',
        displayLineNumbers: true
      },
      preview: { fontSize: '15', codeBlockTheme: DEFAULT_DARK_EDITOR_THEME }
    },
    {
      id: 'writing',
      label: i18n.__('Focus on writing'),
      description: i18n.__(
        'Larger text, no line numbers, room to scroll past the last line.'
      ),
      ui: { theme: 'default', defaultTheme: 'default' },
      editor: {
        theme: DEFAULT_LIGHT_EDITOR_THEME,
        fontSize: '16',
        displayLineNumbers: false,
        scrollPastEnd: true,
        lineWrapping: true
      },
      preview: { fontSize: '16', codeBlockTheme: DEFAULT_LIGHT_EDITOR_THEME }
    },
    {
      id: 'coding',
      label: i18n.__('Writing code'),
      description: i18n.__(
        'Dark editor, line numbers, rulers, and the smart table editor on.'
      ),
      ui: { theme: 'dark', defaultTheme: 'dark' },
      editor: {
        theme: DEFAULT_DARK_EDITOR_THEME,
        fontSize: '14',
        displayLineNumbers: true,
        enableRulers: true,
        enableTableEditor: true,
        scrollPastEnd: true
      },
      preview: { fontSize: '14', codeBlockTheme: DEFAULT_DARK_EDITOR_THEME }
    }
  ]
}

/**
 * プリセットを現在の設定へ重ねる。**上書きするのは持っているキーだけ**で、
 * 触らない項目（ストレージ・ホットキー等）はそのまま残す。
 *
 * @param {object} config 現在の設定
 * @param {Preset} preset
 * @returns {{ui: object, editor: object, preview: object}}
 */
export function applyPreset(config, preset) {
  const base = config || {}
  return {
    ui: Object.assign({}, base.ui, preset.ui),
    editor: Object.assign({}, base.editor, preset.editor),
    preview: Object.assign({}, base.preview, preset.preview)
  }
}

/** いま適用されているプリセット（無ければ null）。見え方の主要項目で判定する */
export function detectPreset(config, presets) {
  if (!config) return null
  const list = presets || getPresets()
  const match = list.find(
    preset =>
      config.ui &&
      config.editor &&
      config.preview &&
      config.ui.theme === preset.ui.theme &&
      config.editor.theme === preset.editor.theme &&
      String(config.editor.fontSize) === String(preset.editor.fontSize) &&
      config.preview.codeBlockTheme === preset.preview.codeBlockTheme &&
      !!config.editor.displayLineNumbers === !!preset.editor.displayLineNumbers
  )
  return match ? match.id : null
}

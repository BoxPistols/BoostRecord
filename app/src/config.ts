// 設定。項目名と選択肢はデスクトップ版（browser/main/lib/ConfigManager.js・
// PreferencesModal/UiTab.js）に揃える。行き来する利用者が同じ言葉で探せるように。
// Web 版で効かない項目（AI・画像・スニペットの登録など）はここに置かない

/** インターフェースのテーマ。デスクトップ版の 9 種と、Web 版のこれまでの配色 */
import { HOTKEYS, IS_MAC, JUMP_MODIFIERS, defaultBindings, defaultJumpModifier, formatCombo, parseCombo, problemOf } from './hotkeys.ts'
import type { Bindings, JumpModifier } from './hotkeys.ts'

export const THEMES = {
  boostrecord: { label: 'BoostRecord', dark: true },
  dark: { label: 'Dark', dark: true },
  dracula: { label: 'Dracula', dark: true },
  monokai: { label: 'Monokai', dark: true },
  nord: { label: 'Nord', dark: true },
  rockabilly: { label: 'Rockabilly', dark: true },
  'solarized-dark': { label: 'Solarized Dark', dark: true },
  vulcan: { label: 'Vulcan', dark: true },
  default: { label: 'Default', dark: false },
  white: { label: 'White', dark: false }
} as const
export type ThemeName = keyof typeof THEMES

type Tokens = Record<
  | 'bg' | 'bg-rail' | 'bg-side' | 'bg-list' | 'bg-elev' | 'fg' | 'muted' | 'faint'
  | 'accent' | 'border' | 'sel' | 'hover' | 'side-active' | 'row-line' | 'on-accent' | 'link',
  string
>

// 色はデスクトップ版の browser/styles/index.styl の $ui-<theme>-* から取った。
// 地（noteDetail / noteList）・文字・枠・強調色はそのまま、Web 版にしかない段差（rail や hover）は地から作る
const PALETTES: Record<ThemeName, Tokens> = {
  boostrecord: {
    bg: '#1e2126', 'bg-rail': '#16181c', 'bg-side': '#23262d', 'bg-list': '#1b1e23', 'bg-elev': '#262a31',
    fg: '#d7dae0', muted: '#7f8694', faint: '#5c6370', accent: '#ff2d75', border: '#2c313a',
    sel: '#ff2d75', hover: '#2a2e36', 'side-active': '#31262e', 'row-line': '#20242b', 'on-accent': '#fff', link: '#60a5fa'
  },
  dark: {
    bg: '#2C3033', 'bg-rail': '#25292b', 'bg-side': '#2C3033', 'bg-list': '#2C3033', 'bg-elev': '#353a3e',
    fg: '#DDDDDD', muted: '#939395', faint: '#6c6f73', accent: '#6AA5E9', border: '#444444',
    sel: '#3A404C', hover: '#3a3f43', 'side-active': '#3A404C', 'row-line': '#363a3d', 'on-accent': '#f4f4f4', link: '#6AA5E9'
  },
  dracula: {
    bg: '#282a36', 'bg-rail': '#21222c', 'bg-side': '#282a36', 'bg-list': '#282a36', 'bg-elev': '#44475a',
    fg: '#f8f8f2', muted: '#a4a6b8', faint: '#6272a4', accent: '#bd93f9', border: '#44475a',
    sel: '#44475a', hover: '#343746', 'side-active': '#44475a', 'row-line': '#303241', 'on-accent': '#282a36', link: '#8be9fd'
  },
  monokai: {
    bg: '#272822', 'bg-rail': '#1f201b', 'bg-side': '#272822', 'bg-list': '#272822', 'bg-elev': '#373831',
    fg: '#f8f8f2', muted: '#a59f85', faint: '#75715e', accent: '#f92672', border: '#373831',
    sel: '#f92672', hover: '#373831', 'side-active': '#3e3d32', 'row-line': '#2f302a', 'on-accent': '#fff', link: '#66d9ef'
  },
  nord: {
    bg: '#2e3440', 'bg-rail': '#272c36', 'bg-side': '#2e3440', 'bg-list': '#2e3440', 'bg-elev': '#434c5e',
    fg: '#d8dee9', muted: '#8fbcbb', faint: '#616e88', accent: '#5e81ac', border: '#3b4252',
    sel: '#5e81ac', hover: '#3b4252', 'side-active': '#434c5e', 'row-line': '#353c4a', 'on-accent': '#eceff4', link: '#88c0d0'
  },
  rockabilly: {
    bg: '#1C1C1E', 'bg-rail': '#161618', 'bg-side': '#242426', 'bg-list': '#242426', 'bg-elev': '#2A2A2D',
    fg: '#EAEAEA', muted: '#9A9A9E', faint: '#6c6c70', accent: '#D7263D', border: '#333336',
    sel: '#D7263D', hover: '#2f2f32', 'side-active': '#3a2427', 'row-line': '#2c2c2f', 'on-accent': '#fff', link: '#5fb3d9'
  },
  'solarized-dark': {
    bg: '#073642', 'bg-rail': '#002b36', 'bg-side': '#073642', 'bg-list': '#073642', 'bg-elev': '#002b36',
    fg: '#93a1a1', muted: '#839496', faint: '#586e75', accent: '#2aa198', border: '#586e75',
    sel: '#2aa198', hover: '#0b4250', 'side-active': '#0e4a59', 'row-line': '#0a3d4a', 'on-accent': '#fdf6e3', link: '#268bd2'
  },
  vulcan: {
    bg: '#161719', 'bg-rail': '#111213', 'bg-side': '#161719', 'bg-list': '#161719', 'bg-elev': '#282a2e',
    fg: '#999999', muted: '#7a7a7a', faint: '#55575b', accent: '#ffffff', border: '#282a2e',
    sel: '#282a2e', hover: '#202124', 'side-active': '#282a2e', 'row-line': '#1d1e21', 'on-accent': '#161719', link: '#c5c8c6'
  },
  default: {
    bg: '#FFFFFF', 'bg-rail': '#F3F3F3', 'bg-side': '#FBFBFB', 'bg-list': '#FBFBFB', 'bg-elev': '#FFFFFF',
    fg: '#333333', muted: '#939395', faint: '#b4b4b6', accent: '#6AA5E9', border: '#D1D1D1',
    sel: '#6AA5E9', hover: '#F0F0F0', 'side-active': '#E6EEF8', 'row-line': '#EEEEEE', 'on-accent': '#fff', link: '#2f7bd6'
  },
  white: {
    bg: '#F4F4F4', 'bg-rail': '#E9E9E9', 'bg-side': '#F3F3F3', 'bg-list': '#F3F3F3', 'bg-elev': '#FFFFFF',
    fg: '#333333', muted: '#939395', faint: '#b4b4b6', accent: '#6AA5E9', border: '#D1D1D1',
    sel: '#6AA5E9', hover: '#E8E8E8', 'side-active': '#E1EAF5', 'row-line': '#E6E6E6', 'on-accent': '#fff', link: '#2f7bd6'
  }
}

export interface Config {
  ui: { theme: ThemeName }
  editor: {
    fontFamily: string
    fontSize: number
    indentType: 'space' | 'tab'
    indentSize: 1 | 2 | 4 | 8
    displayLineNumbers: boolean
    scrollPastEnd: boolean
    /** ⌘/Ctrl + / などで入れる日付を ISO 8601 にする */
    dateFormatISO8601: boolean
  }
  preview: {
    fontFamily: string
    fontSize: number
    /** Markdown 中の改行でプレビューも改行する（markdown-it の breaks） */
    breaks: boolean
  }
  /** ショートカット。設定の「ホットキー」で書き換える */
  hotkey: Bindings & { jumpModifier: JumpModifier }
}

export const FONT_SIZE = { min: 8, max: 32 }
export const INDENT_SIZES = [1, 2, 4, 8] as const

// 見た目はこれまでの Web 版のまま。フォントは空なら OS の既定（等幅 / 本文）
export const DEFAULT_CONFIG: Config = {
  ui: { theme: 'boostrecord' },
  editor: {
    fontFamily: '',
    fontSize: 13,
    indentType: 'space',
    indentSize: 2,
    displayLineNumbers: true,
    scrollPastEnd: false,
    dateFormatISO8601: false
  },
  preview: { fontFamily: '', fontSize: 13, breaks: true },
  hotkey: { ...defaultBindings(), jumpModifier: defaultJumpModifier(IS_MAC) }
}

type Loose = Record<string, unknown>
const obj = (v: unknown): Loose => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : {})
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
// デスクトップ版は数値を文字列で持つ（'14'）。どちらでも読めるようにする
const size = (v: unknown, d: number) => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n)
    ? Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(n)))
    : d
}
// フォント名は CSS にそのまま入るので、宣言を閉じたり別の値を足せる文字を通さない
const font = (v: unknown, d: string) =>
  typeof v === 'string' && v.length <= 200 && !/[;{}<>\\]/.test(v) ? v.trim() : d

/** 保存値を読む。足りない・壊れた値は既定値で埋める */
export function parseConfig(raw: string | null): Config {
  let v: Loose = {}
  try {
    v = obj(raw ? JSON.parse(raw) : null)
  } catch {
    // 壊れていれば既定値
  }
  const ui = obj(v.ui)
  const ed = obj(v.editor)
  const pv = obj(v.preview)
  const hk = obj(v.hotkey)
  const d = DEFAULT_CONFIG
  const indentSize = Number(ed.indentSize)
  return {
    ui: {
      // in だと constructor など継承したキーも通るので、自前のキーだけを見る
      theme:
        typeof ui.theme === 'string' && Object.hasOwn(THEMES, ui.theme) ? (ui.theme as ThemeName) : d.ui.theme
    },
    editor: {
      fontFamily: font(ed.fontFamily, d.editor.fontFamily),
      fontSize: size(ed.fontSize, d.editor.fontSize),
      indentType: ed.indentType === 'tab' ? 'tab' : 'space',
      indentSize: (INDENT_SIZES as readonly number[]).includes(indentSize)
        ? (indentSize as Config['editor']['indentSize'])
        : d.editor.indentSize,
      displayLineNumbers: bool(ed.displayLineNumbers, d.editor.displayLineNumbers),
      scrollPastEnd: bool(ed.scrollPastEnd, d.editor.scrollPastEnd),
      dateFormatISO8601: bool(ed.dateFormatISO8601, d.editor.dateFormatISO8601)
    },
    preview: {
      fontFamily: font(pv.fontFamily, d.preview.fontFamily),
      fontSize: size(pv.fontSize, d.preview.fontSize),
      breaks: bool(pv.breaks, d.preview.breaks)
    },
    hotkey: parseHotkeys(hk, d.hotkey)
  }
}

// 読めないキーや、OS・ブラウザが先に取るキー（block）は既定値に戻す。同じキーが 2 つの操作に
// 付いていたら、後のほうを既定値に戻す（既定値どうしは重ならない）
function parseHotkeys(hk: Loose, d: Config['hotkey']): Config['hotkey'] {
  const out = { ...d }
  const used = new Set<string>()
  for (const h of HOTKEYS) {
    const v = hk[h.id]
    const ok = typeof v === 'string' && parseCombo(v) && problemOf(v)?.level !== 'block'
    const combo = ok ? formatCombo(parseCombo(v as string)!) : d[h.id]
    out[h.id] = used.has(combo) ? d[h.id] : combo
    used.add(out[h.id])
  }
  out.jumpModifier = JUMP_MODIFIERS.includes(hk.jumpModifier as JumpModifier)
    ? (hk.jumpModifier as JumpModifier)
    : d.jumpModifier
  return out
}

/** テーマとフォントを CSS 変数として当てる。各部品は var(--*) で読む */
export function themeVariables(config: Config): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [k, value] of Object.entries(PALETTES[config.ui.theme])) vars[`--${k}`] = value
  vars['--editor-font-size'] = `${config.editor.fontSize}px`
  vars['--preview-font-size'] = `${config.preview.fontSize}px`
  vars['--editor-font'] = config.editor.fontFamily
    ? `${config.editor.fontFamily}, monospace`
    : "'SFMono-Regular', Menlo, Consolas, monospace"
  vars['--preview-font'] = config.preview.fontFamily ? `${config.preview.fontFamily}, sans-serif` : 'inherit'
  return vars
}

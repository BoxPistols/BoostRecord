// ショートカットの定義・既定値・判定。設定で書き換えられる（デスクトップ版の hotkey と同じ考え方）。
// キーは "Mod+Shift+F" の形で持つ。Mod は Mac で ⌘、それ以外で Ctrl

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

export type HotkeyId =
  | 'newNote'
  | 'findInNote'
  | 'focusListSearch'
  | 'toggleSidebar'
  | 'toggleNoteList'
  | 'togglePreview'
  | 'cycleView'
  | 'openPrefs'
  | 'nextNote'
  | 'prevNote'
  | 'italic'
  | 'link'
  | 'insertDate'
  | 'insertDateTime'
  | 'prettify'
  | 'sortLines'

export interface HotkeyDef {
  id: HotkeyId
  desc: string
  /** editor はエディタにフォーカスがあるときだけ効く */
  scope: 'app' | 'editor'
  def: (mac: boolean) => string
}

export const HOTKEYS: HotkeyDef[] = [
  { id: 'newNote', desc: '新規ノート', scope: 'app', def: () => 'Mod+N' },
  { id: 'findInNote', desc: 'このノート内を検索（Enter で次、Shift + Enter で前）', scope: 'app', def: () => 'Mod+F' },
  { id: 'focusListSearch', desc: 'ノート一覧の検索にフォーカス', scope: 'app', def: () => 'Ctrl+L' },
  { id: 'toggleSidebar', desc: 'サイドバーを 展開 → 畳む → 隠す', scope: 'app', def: () => 'Mod+B' },
  { id: 'toggleNoteList', desc: 'ノート一覧を 展開 → 畳む → 隠す', scope: 'app', def: () => 'Mod+Shift+B' },
  { id: 'togglePreview', desc: 'エディタとプレビュー ↔ プレビューだけ', scope: 'app', def: () => 'Mod+E' },
  { id: 'cycleView', desc: 'エディタだけ → 両方 → プレビューだけ', scope: 'app', def: () => 'Mod+Shift+E' },
  { id: 'nextNote', desc: '一覧の次のノートへ', scope: 'app', def: () => 'Mod+Alt+ArrowDown' },
  { id: 'prevNote', desc: '一覧の前のノートへ', scope: 'app', def: () => 'Mod+Alt+ArrowUp' },
  { id: 'openPrefs', desc: '設定を開く', scope: 'app', def: () => 'Mod+,' },
  { id: 'italic', desc: '斜体（選択をトグル）', scope: 'editor', def: () => 'Mod+I' },
  { id: 'link', desc: 'リンク化', scope: 'editor', def: () => 'Mod+K' },
  { id: 'insertDate', desc: '今日の日付を入れる', scope: 'editor', def: () => 'Mod+/' },
  { id: 'insertDateTime', desc: '今の日時を入れる', scope: 'editor', def: mac => (mac ? 'Mod+Alt+/' : 'Ctrl+Shift+/') },
  { id: 'prettify', desc: 'Markdown を整える（prettier）', scope: 'editor', def: () => 'Mod+Shift+F' },
  { id: 'sortLines', desc: '選んだ行を並べ替える', scope: 'editor', def: () => 'Mod+Shift+S' }
]

/** 番号で一覧のノートへ飛ぶときに押し続けるキー */
export type JumpModifier = 'Ctrl' | 'Alt' | 'Mod' | 'Mod+Alt'
export const JUMP_MODIFIERS: JumpModifier[] = ['Ctrl', 'Alt', 'Mod', 'Mod+Alt']
export const defaultJumpModifier = (mac: boolean): JumpModifier => (mac ? 'Ctrl' : 'Alt')

export type Bindings = Record<HotkeyId, string>

export function defaultBindings(mac = IS_MAC): Bindings {
  return Object.fromEntries(HOTKEYS.map(h => [h.id, h.def(mac)])) as Bindings
}

const MODS = ['Mod', 'Ctrl', 'Alt', 'Shift'] as const
type Mod = (typeof MODS)[number]

interface Combo {
  mods: Set<Mod>
  key: string
}

// e.code から、配列（JIS / US）や Option の文字変換に左右されないキー名を出す
const CODE_KEYS: Record<string, string> = {
  Slash: '/', Comma: ',', Period: '.', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Space: 'Space', Enter: 'Enter', Escape: 'Escape',
  Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight'
}

function keyOfEvent(e: Pick<KeyboardEvent, 'code' | 'key'>): string | null {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3)
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5)
  if (/^F\d{1,2}$/.test(e.code)) return e.code
  if (CODE_KEYS[e.code]) return CODE_KEYS[e.code]
  if (['Meta', 'Control', 'Alt', 'Shift', 'OS'].includes(e.key)) return null
  return e.key.length === 1 ? e.key.toUpperCase() : e.key
}

export function parseCombo(text: string): Combo | null {
  if (typeof text !== 'string' || !text.trim()) return null
  const parts = text.split('+').map(p => p.trim())
  // "Mod++" のように + そのものをキーにした形も読む
  const key = text.endsWith('++') ? '+' : parts.pop()!
  if (text.endsWith('++')) parts.splice(parts.length - 2)
  if (!key) return null
  const mods = new Set<Mod>()
  for (const p of parts) {
    if (!(MODS as readonly string[]).includes(p) || mods.has(p as Mod)) return null
    mods.add(p as Mod)
  }
  return { mods, key: key.length === 1 ? key.toUpperCase() : key }
}

export function formatCombo(c: Combo): string {
  return [...MODS.filter(m => c.mods.has(m)), c.key].join('+')
}

/** キー入力から "Mod+Shift+F" の形を作る（設定で押して登録するとき）。修飾キーだけなら null */
export function comboFromEvent(e: KeyboardEvent, mac = IS_MAC): string | null {
  const key = keyOfEvent(e)
  if (!key) return null
  const mods = new Set<Mod>()
  if (mac ? e.metaKey : e.ctrlKey) mods.add('Mod')
  if (mac && e.ctrlKey) mods.add('Ctrl')
  if (e.altKey) mods.add('Alt')
  if (e.shiftKey) mods.add('Shift')
  return formatCombo({ mods, key })
}

/** 押されたキーが登録のキーと同じか。修飾キーは過不足なく一致したときだけ */
export function matches(e: KeyboardEvent, combo: string, mac = IS_MAC): boolean {
  const c = parseCombo(combo)
  return !!c && comboFromEvent(e, mac) === formatCombo(c)
}

/** 番号ジャンプの修飾キーだけが押されているか。数字は 1〜9 が上から 1〜9 番目、0 が 10 番目 */
export function jumpIndex(e: KeyboardEvent, mod: JumpModifier, mac = IS_MAC): number | null {
  const m = /^Digit(\d)$/.exec(e.code)
  if (!m) return null
  const want = parseCombo(`${mod}+X`)!.mods
  const has = new Set<Mod>()
  if (mac ? e.metaKey : e.ctrlKey) has.add('Mod')
  if (mac && e.ctrlKey) has.add('Ctrl')
  if (e.altKey) has.add('Alt')
  if (e.shiftKey) has.add('Shift')
  if (has.size !== want.size || [...want].some(x => !has.has(x))) return null
  const n = Number(m[1])
  return n === 0 ? 9 : n - 1
}

/** 修飾キーそのものが押されたか（押し続けで番号を出すため）。ほかの修飾キーも押していれば違う */
export function isJumpModifierKey(e: KeyboardEvent, mod: JumpModifier, mac = IS_MAC): boolean {
  const name = (m: Mod) => (m === 'Mod' ? (mac ? 'Meta' : 'Control') : m === 'Ctrl' ? 'Control' : m === 'Alt' ? 'Alt' : 'Shift')
  const want = [...parseCombo(`${mod}+X`)!.mods]
  if (!want.some(m => name(m) === e.key)) return false
  const has = new Set<Mod>()
  if (mac ? e.metaKey : e.ctrlKey) has.add('Mod')
  if (mac && e.ctrlKey) has.add('Ctrl')
  if (e.altKey) has.add('Alt')
  if (e.shiftKey) has.add('Shift')
  return has.size === want.length && want.every(m => has.has(m))
}

/** CodeMirror の keymap の書き方へ（"Mod+Shift+F" → "Mod-Shift-f"） */
export function toCodeMirror(combo: string): string | null {
  const c = parseCombo(combo)
  if (!c) return null
  const key = c.key.length === 1 ? c.key.toLowerCase() : c.key === 'Space' ? ' ' : c.key
  return [...MODS.filter(m => c.mods.has(m)), key].join('-')
}

/** 画面に出す表記。Mac は ⌘ ⌥ ⇧ ⌃ */
export function displayCombo(combo: string, mac = IS_MAC): string {
  if (!combo) return '未設定'
  const c = parseCombo(combo)
  if (!c) return combo
  const names: Record<Mod, string> = mac
    ? { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' }
    : { Mod: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift' }
  const arrows: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }
  const key = arrows[c.key] ?? c.key
  const mods = MODS.filter(m => c.mods.has(m)).map(m => names[m])
  return mac ? [...mods, key].join('') : [...mods, key].join(' + ')
}

export type Problem = { level: 'block' | 'warn'; reason: string }

/**
 * OS やブラウザが先に使うキーを調べる。block は登録させない（押してもアプリに届かないか、
 * 画面の撮影などを奪う）。warn はタブで開いているときだけブラウザと重なるもの
 */
export function problemOf(combo: string, mac = IS_MAC): Problem | null {
  const c = parseCombo(combo)
  if (!c) return { level: 'block', reason: '読めないキーです' }
  const m = (...x: Mod[]) => x.length === c.mods.size && x.every(y => c.mods.has(y))
  const k = c.key
  if (c.mods.size === 0 || (m('Shift') && k.length === 1)) return { level: 'block', reason: '文字の入力と重なります。⌘/Ctrl か Option/Alt と組み合わせてください' }
  if (mac && m('Mod', 'Shift') && /^[3-6]$/.test(k)) return { level: 'block', reason: 'macOS の画面の撮影に使われています' }
  if (mac && m('Mod', 'Shift') && /^\d$/.test(k)) return { level: 'warn', reason: 'macOS の画面の撮影と近いキーです' }
  if (mac && (m('Mod') || m('Ctrl')) && k === 'Space') return { level: 'block', reason: 'macOS の Spotlight・入力切り替えに使われています' }
  if (m('Mod') && ['Q', 'W', 'T'].includes(k)) return { level: 'block', reason: 'ブラウザがタブやウィンドウを閉じる・開くのに使い、アプリには届きません' }
  if (m('Mod', 'Shift') && ['N', 'T', 'W'].includes(k)) return { level: 'block', reason: 'ブラウザがウィンドウ・タブの操作に使い、アプリには届きません' }
  if (m('Mod') && k === 'Tab') return { level: 'block', reason: 'OS のアプリ切り替えに使われています' }
  if (m('Mod') && k === 'N') return { level: 'warn', reason: 'タブで開いているときはブラウザの「新しいウィンドウ」が先に動きます（ホーム画面のアプリでは効きます）' }
  if (m('Mod') && /^\d$/.test(k)) return { level: 'warn', reason: 'タブで開いているときはブラウザのタブ切り替えと重なります' }
  if (m('Mod') && ['[', ']'].includes(k)) return { level: 'warn', reason: 'ブラウザの「戻る・進む」と重なります' }
  if (m('Mod') && ['R', 'L', 'D', 'P', 'O', 'H', 'M'].includes(k)) return { level: 'warn', reason: 'ブラウザや OS の操作（再読み込み・アドレス欄・ブックマーク・印刷など）と重なります' }
  if (m('Mod', 'Alt') && ['ArrowLeft', 'ArrowRight', 'I', 'J'].includes(k)) return { level: 'warn', reason: 'ブラウザのタブ切り替えや開発ツールと重なります' }
  return null
}

/** 設定でキーを登録している間は、ほかのショートカットを動かさない。登録待ちの数を数える */
export const recording = {
  count: 0,
  get active() {
    return this.count > 0
  }
}

/** 番号ジャンプの表記（例 ⌃ 0〜9） */
export function jumpLabel(mod: JumpModifier, mac = IS_MAC) {
  return displayCombo(`${mod}+1`, mac).replace(/1$/, ' 0〜9')
}

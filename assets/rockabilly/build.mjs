#!/usr/bin/env node
/**
 * Rockabilly カラースキームの配布物をまとめて生成する。
 *
 * 色の出どころは palette.json ただ 1 つ。各形式へ手で書き写すと必ずどこかが
 * ずれるので、ここから機械的に吐く。値を変えたら check-contrast.mjs を通してから
 * このスクリプトを回す。
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const dist = join(here, 'dist')
const P = JSON.parse(readFileSync(join(here, 'palette.json'), 'utf8'))

const ui = Object.fromEntries(Object.entries(P.ui).map(([k, v]) => [k, v.value]))
const sx = Object.fromEntries(Object.entries(P.syntax).map(([k, v]) => [k, v.value]))
const an = P.ansi
const NAME = P.name
const SLUG = NAME.toLowerCase()

const out = (rel, body) => {
  const file = join(dist, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body.endsWith('\n') ? body : body + '\n')
  return rel
}
const written = []
const emit = (rel, body) => written.push(out(rel, body))

const HEADER = `${NAME} — ${P.description}\nGenerated from palette.json. Do not edit by hand.`

/* ── 1. CodeMirror 5 ─────────────────────────────────────────────────── */
const codemirror = `/* ${HEADER.replace(/\n/g, '\n   ')} */

.cm-s-${SLUG}.CodeMirror { background: ${ui.bg}; color: ${ui.fg}; }
.cm-s-${SLUG} div.CodeMirror-selected { background: ${ui.border}; }
.cm-s-${SLUG} .CodeMirror-line::selection,
.cm-s-${SLUG} .CodeMirror-line > span::selection,
.cm-s-${SLUG} .CodeMirror-line > span > span::selection { background: ${ui.border}; }
.cm-s-${SLUG} .CodeMirror-line::-moz-selection,
.cm-s-${SLUG} .CodeMirror-line > span::-moz-selection,
.cm-s-${SLUG} .CodeMirror-line > span > span::-moz-selection { background: ${ui.border}; }
.cm-s-${SLUG} .CodeMirror-gutters { background: ${ui.bg}; border-right: 0; }
.cm-s-${SLUG} .CodeMirror-guttermarker { color: ${sx.red}; }
.cm-s-${SLUG} .CodeMirror-guttermarker-subtle { color: ${ui.muted}; }
.cm-s-${SLUG} .CodeMirror-linenumber { color: ${an.brightBlack}; }
.cm-s-${SLUG} .CodeMirror-cursor { border-left: 1px solid ${ui.accentAlt}; }
.cm-s-${SLUG} .CodeMirror-activeline-background { background: ${ui.bgAlt}; }
.cm-s-${SLUG} .CodeMirror-matchingbracket { color: ${ui.fg} !important; text-decoration: underline; }
.cm-s-${SLUG} .CodeMirror-nonmatchingbracket { color: ${sx.red} !important; }

.cm-s-${SLUG} span.cm-comment { color: ${sx.comment}; font-style: italic; }
.cm-s-${SLUG} span.cm-keyword { color: ${sx.red}; }
.cm-s-${SLUG} span.cm-atom { color: ${sx.orange}; }
.cm-s-${SLUG} span.cm-number { color: ${sx.orange}; }
.cm-s-${SLUG} span.cm-string { color: ${sx.green}; }
.cm-s-${SLUG} span.cm-string-2 { color: ${sx.teal}; }
.cm-s-${SLUG} span.cm-def { color: ${sx.blue}; }
.cm-s-${SLUG} span.cm-variable { color: ${ui.fg}; }
.cm-s-${SLUG} span.cm-variable-2 { color: ${sx.blue}; }
.cm-s-${SLUG} span.cm-variable-3, .cm-s-${SLUG} span.cm-type { color: ${sx.yellow}; }
.cm-s-${SLUG} span.cm-property { color: ${sx.teal}; }
.cm-s-${SLUG} span.cm-operator { color: ${sx.purple}; }
.cm-s-${SLUG} span.cm-builtin { color: ${sx.teal}; }
.cm-s-${SLUG} span.cm-qualifier { color: ${sx.yellow}; }
.cm-s-${SLUG} span.cm-tag { color: ${sx.purple}; }
.cm-s-${SLUG} span.cm-attribute { color: ${sx.orange}; }
.cm-s-${SLUG} span.cm-meta { color: ${sx.brown}; }
.cm-s-${SLUG} span.cm-bracket { color: ${ui.muted}; }
.cm-s-${SLUG} span.cm-header { color: ${sx.yellow}; font-weight: bold; }
.cm-s-${SLUG} span.cm-hr { color: ${ui.border}; }
.cm-s-${SLUG} span.cm-link { color: ${sx.purple}; text-decoration: underline; }
.cm-s-${SLUG} span.cm-quote { color: ${sx.green}; }
.cm-s-${SLUG} span.cm-em { font-style: italic; }
.cm-s-${SLUG} span.cm-strong { font-weight: bold; }
.cm-s-${SLUG} span.cm-error { background: ${sx.red}; color: ${ui.bg}; }
.cm-s-${SLUG} span.cm-invalidchar { background: ${sx.red}; color: ${ui.bg}; }
`
emit(`codemirror/${SLUG}.css`, codemirror)
// アプリが読むのはこちら（extra_scripts に置いたものが環境設定の一覧に出る）
mkdirSync(join(repoRoot, 'extra_scripts/codemirror/theme'), { recursive: true })
copyFileSync(join(dist, `codemirror/${SLUG}.css`), join(repoRoot, `extra_scripts/codemirror/theme/${SLUG}.css`))

/* ── 2. VS Code ──────────────────────────────────────────────────────── */
const tokenColor = (name, scopes, foreground, fontStyle) => ({
  name,
  scope: scopes,
  settings: fontStyle ? { foreground, fontStyle } : { foreground }
})
const vscodeTheme = {
  $schema: 'vscode://schemas/color-theme',
  name: NAME,
  type: 'dark',
  semanticHighlighting: true,
  colors: {
    'editor.background': ui.bg,
    'editor.foreground': ui.fg,
    'editorLineNumber.foreground': an.brightBlack,
    'editorLineNumber.activeForeground': ui.fg,
    'editorCursor.foreground': ui.accentAlt,
    'editor.selectionBackground': ui.border,
    'editor.selectionHighlightBackground': `${ui.border}80`,
    'editor.lineHighlightBackground': ui.bgAlt,
    'editor.wordHighlightBackground': `${ui.border}80`,
    'editorWhitespace.foreground': `${an.brightBlack}80`,
    'editorIndentGuide.background1': ui.border,
    'editorIndentGuide.activeBackground1': an.brightBlack,
    'editorBracketMatch.background': ui.surface,
    'editorBracketMatch.border': ui.accentAlt,
    'editorError.foreground': sx.red,
    'editorWarning.foreground': sx.orange,
    'editorInfo.foreground': sx.blue,
    'editorGutter.addedBackground': sx.green,
    'editorGutter.modifiedBackground': sx.orange,
    'editorGutter.deletedBackground': sx.red,
    'editorWidget.background': ui.bgAlt,
    'editorWidget.border': ui.border,
    'editorSuggestWidget.background': ui.bgAlt,
    'editorSuggestWidget.selectedBackground': ui.surface,
    'editorHoverWidget.background': ui.bgAlt,
    'editorHoverWidget.border': ui.border,
    'peekViewEditor.background': ui.bgAlt,
    'diffEditor.insertedTextBackground': `${sx.green}26`,
    'diffEditor.removedTextBackground': `${sx.red}26`,
    focusBorder: ui.accent,
    foreground: ui.fg,
    'widget.shadow': '#00000066',
    'selection.background': `${ui.accent}59`,
    descriptionForeground: ui.muted,
    errorForeground: sx.red,
    'textLink.foreground': sx.blue,
    'textLink.activeForeground': sx.teal,
    'button.background': ui.accent,
    'button.foreground': '#FFFFFF',
    'button.hoverBackground': ui.accentAlt,
    'input.background': ui.surface,
    'input.foreground': ui.fg,
    'input.border': ui.border,
    'inputOption.activeBorder': ui.accent,
    'dropdown.background': ui.surface,
    'dropdown.border': ui.border,
    'badge.background': ui.accent,
    'badge.foreground': '#FFFFFF',
    'progressBar.background': ui.accent,
    'scrollbarSlider.background': `${ui.border}CC`,
    'scrollbarSlider.hoverBackground': `${an.brightBlack}CC`,
    'scrollbarSlider.activeBackground': ui.accent,
    'activityBar.background': ui.bg,
    'activityBar.foreground': ui.fg,
    'activityBar.inactiveForeground': ui.muted,
    'activityBar.border': ui.border,
    'activityBarBadge.background': ui.accent,
    'activityBarBadge.foreground': '#FFFFFF',
    'sideBar.background': ui.bgAlt,
    'sideBar.foreground': ui.fg,
    'sideBar.border': ui.border,
    'sideBarSectionHeader.background': ui.surface,
    'sideBarTitle.foreground': ui.muted,
    'list.activeSelectionBackground': ui.surface,
    'list.activeSelectionForeground': ui.fg,
    'list.inactiveSelectionBackground': ui.bgAlt,
    'list.hoverBackground': ui.surface,
    'list.highlightForeground': ui.accentAlt,
    'list.errorForeground': sx.red,
    'list.warningForeground': sx.orange,
    'editorGroupHeader.tabsBackground': ui.bg,
    'editorGroup.border': ui.border,
    'tab.activeBackground': ui.bgAlt,
    'tab.activeForeground': ui.fg,
    'tab.inactiveBackground': ui.bg,
    'tab.inactiveForeground': ui.muted,
    'tab.border': ui.border,
    'tab.activeBorderTop': ui.accent,
    'statusBar.background': ui.bg,
    'statusBar.foreground': ui.muted,
    'statusBar.border': ui.border,
    'statusBar.debuggingBackground': ui.accent,
    'statusBar.noFolderBackground': ui.bg,
    'statusBarItem.remoteBackground': ui.accent,
    'titleBar.activeBackground': ui.bg,
    'titleBar.activeForeground': ui.fg,
    'titleBar.inactiveBackground': ui.bg,
    'titleBar.inactiveForeground': ui.muted,
    'titleBar.border': ui.border,
    'panel.background': ui.bg,
    'panel.border': ui.border,
    'panelTitle.activeBorder': ui.accent,
    'panelTitle.activeForeground': ui.fg,
    'panelTitle.inactiveForeground': ui.muted,
    'terminal.background': ui.bg,
    'terminal.foreground': ui.fg,
    'terminalCursor.foreground': ui.accentAlt,
    'terminal.ansiBlack': an.black,
    'terminal.ansiRed': an.red,
    'terminal.ansiGreen': an.green,
    'terminal.ansiYellow': an.yellow,
    'terminal.ansiBlue': an.blue,
    'terminal.ansiMagenta': an.magenta,
    'terminal.ansiCyan': an.cyan,
    'terminal.ansiWhite': an.white,
    'terminal.ansiBrightBlack': an.brightBlack,
    'terminal.ansiBrightRed': an.brightRed,
    'terminal.ansiBrightGreen': an.brightGreen,
    'terminal.ansiBrightYellow': an.brightYellow,
    'terminal.ansiBrightBlue': an.brightBlue,
    'terminal.ansiBrightMagenta': an.brightMagenta,
    'terminal.ansiBrightCyan': an.brightCyan,
    'terminal.ansiBrightWhite': an.brightWhite,
    'gitDecoration.modifiedResourceForeground': sx.orange,
    'gitDecoration.deletedResourceForeground': sx.red,
    'gitDecoration.untrackedResourceForeground': sx.green,
    'gitDecoration.ignoredResourceForeground': an.brightBlack,
    'gitDecoration.conflictingResourceForeground': sx.purple,
    'minimap.findMatchHighlight': ui.accentAlt,
    'breadcrumb.foreground': ui.muted,
    'breadcrumb.focusForeground': ui.fg,
    'menu.background': ui.bgAlt,
    'menu.foreground': ui.fg,
    'menu.selectionBackground': ui.surface,
    'notificationCenterHeader.background': ui.bgAlt,
    'notifications.background': ui.bgAlt,
    'notifications.border': ui.border
  },
  tokenColors: [
    tokenColor('Comment', ['comment', 'punctuation.definition.comment'], sx.comment, 'italic'),
    tokenColor('Keyword', ['keyword', 'storage', 'storage.type', 'keyword.control'], sx.red),
    tokenColor('Operator', ['keyword.operator', 'punctuation.separator', 'punctuation.terminator'], sx.purple),
    tokenColor('String', ['string', 'punctuation.definition.string'], sx.green),
    tokenColor('String escape', ['constant.character.escape', 'string.regexp'], sx.teal),
    tokenColor('Number and constant', ['constant.numeric', 'constant.language', 'constant.other'], sx.orange),
    tokenColor('Variable', ['variable', 'meta.definition.variable'], ui.fg),
    tokenColor('Parameter', ['variable.parameter'], sx.blue),
    tokenColor('Property', ['variable.other.property', 'support.variable', 'meta.object-literal.key'], sx.teal),
    tokenColor('Function', ['entity.name.function', 'support.function', 'meta.function-call'], sx.blue),
    tokenColor('Class and type', ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'], sx.yellow),
    tokenColor('Tag', ['entity.name.tag'], sx.purple),
    tokenColor('Attribute', ['entity.other.attribute-name'], sx.orange),
    tokenColor('Deprecated and embedded', ['invalid.deprecated', 'punctuation.section.embedded'], sx.brown),
    tokenColor('Invalid', ['invalid.illegal'], ui.bg),
    tokenColor('Markdown heading', ['markup.heading', 'entity.name.section'], sx.yellow, 'bold'),
    tokenColor('Markdown link', ['markup.underline.link', 'string.other.link'], sx.purple),
    tokenColor('Markdown bold', ['markup.bold'], sx.orange, 'bold'),
    tokenColor('Markdown italic', ['markup.italic'], sx.orange, 'italic'),
    tokenColor('Markdown quote', ['markup.quote'], sx.green, 'italic'),
    tokenColor('Diff inserted', ['markup.inserted'], sx.green),
    tokenColor('Diff deleted', ['markup.deleted'], sx.red),
    tokenColor('Diff changed', ['markup.changed'], sx.orange)
  ]
}
emit('vscode/themes/rockabilly-color-theme.json', JSON.stringify(vscodeTheme, null, 2))
emit('vscode/package.json', JSON.stringify({
  name: `${SLUG}-theme`,
  displayName: `${NAME} Theme`,
  description: P.description,
  version: '0.1.0',
  publisher: 'the-boosters',
  license: 'MIT',
  engines: { vscode: '^1.75.0' },
  categories: ['Themes'],
  keywords: ['theme', 'dark', 'color-theme', SLUG],
  contributes: {
    themes: [
      { label: NAME, uiTheme: 'vs-dark', path: './themes/rockabilly-color-theme.json' }
    ]
  }
}, null, 2))

/* ── 3. iTerm2 ───────────────────────────────────────────────────────── */
const comp = (hex, i) => (parseInt(hex.replace('#', '').substr(i * 2, 2), 16) / 255).toFixed(10)
const itermColor = hex => `	<dict>
		<key>Alpha Component</key>
		<real>1</real>
		<key>Blue Component</key>
		<real>${comp(hex, 2)}</real>
		<key>Color Space</key>
		<string>sRGB</string>
		<key>Green Component</key>
		<real>${comp(hex, 1)}</real>
		<key>Red Component</key>
		<real>${comp(hex, 0)}</real>
	</dict>`
const ansiOrder = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite']
const itermEntries = [
  ...ansiOrder.map((k, i) => [`Ansi ${i} Color`, an[k]]),
  ['Background Color', ui.bg],
  ['Bold Color', an.brightWhite],
  ['Cursor Color', ui.accentAlt],
  ['Cursor Text Color', ui.bg],
  ['Foreground Color', ui.fg],
  ['Link Color', sx.blue],
  ['Selected Text Color', ui.fg],
  ['Selection Color', ui.border]
]
emit(`iterm2/${NAME}.itermcolors`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${itermEntries.map(([k, v]) => `	<key>${k}</key>\n${itermColor(v)}`).join('\n')}
</dict>
</plist>`)

/* ── 4. Windows Terminal ─────────────────────────────────────────────── */
emit('windows-terminal/rockabilly.json', JSON.stringify({
  name: NAME,
  background: ui.bg,
  foreground: ui.fg,
  cursorColor: ui.accentAlt,
  selectionBackground: ui.border,
  black: an.black, red: an.red, green: an.green, yellow: an.yellow,
  blue: an.blue, purple: an.magenta, cyan: an.cyan, white: an.white,
  brightBlack: an.brightBlack, brightRed: an.brightRed, brightGreen: an.brightGreen,
  brightYellow: an.brightYellow, brightBlue: an.brightBlue, brightPurple: an.brightMagenta,
  brightCyan: an.brightCyan, brightWhite: an.brightWhite
}, null, 2))

/* ── 5. Alacritty ────────────────────────────────────────────────────── */
emit('alacritty/rockabilly.toml', `# ${HEADER.replace(/\n/g, '\n# ')}

[colors.primary]
background = "${ui.bg}"
foreground = "${ui.fg}"

[colors.cursor]
text = "${ui.bg}"
cursor = "${ui.accentAlt}"

[colors.selection]
text = "${ui.fg}"
background = "${ui.border}"

[colors.normal]
black = "${an.black}"
red = "${an.red}"
green = "${an.green}"
yellow = "${an.yellow}"
blue = "${an.blue}"
magenta = "${an.magenta}"
cyan = "${an.cyan}"
white = "${an.white}"

[colors.bright]
black = "${an.brightBlack}"
red = "${an.brightRed}"
green = "${an.brightGreen}"
yellow = "${an.brightYellow}"
blue = "${an.brightBlue}"
magenta = "${an.brightMagenta}"
cyan = "${an.brightCyan}"
white = "${an.brightWhite}"
`)

/* ── 6. kitty ────────────────────────────────────────────────────────── */
emit('kitty/rockabilly.conf', `# ${HEADER.replace(/\n/g, '\n# ')}

foreground ${ui.fg}
background ${ui.bg}
selection_foreground ${ui.fg}
selection_background ${ui.border}
cursor ${ui.accentAlt}
cursor_text_color ${ui.bg}
url_color ${sx.blue}

${ansiOrder.map((k, i) => `color${i} ${an[k]}`).join('\n')}
`)

/* ── 7. WezTerm ──────────────────────────────────────────────────────── */
emit('wezterm/rockabilly.lua', `-- ${HEADER.replace(/\n/g, '\n-- ')}

return {
  foreground = "${ui.fg}",
  background = "${ui.bg}",
  cursor_bg = "${ui.accentAlt}",
  cursor_fg = "${ui.bg}",
  cursor_border = "${ui.accentAlt}",
  selection_fg = "${ui.fg}",
  selection_bg = "${ui.border}",
  ansi = { ${ansiOrder.slice(0, 8).map(k => `"${an[k]}"`).join(', ')} },
  brights = { ${ansiOrder.slice(8).map(k => `"${an[k]}"`).join(', ')} },
}
`)

/* ── 8. base16 / tinted-theming ──────────────────────────────────────── */
const base16 = {
  base00: ui.bg, base01: ui.bgAlt, base02: ui.border, base03: an.brightBlack,
  base04: ui.muted, base05: ui.fg, base06: an.brightWhite, base07: '#F7F7F9',
  base08: sx.red, base09: sx.orange, base0A: sx.yellow, base0B: sx.green,
  base0C: sx.teal, base0D: sx.blue, base0E: sx.purple, base0F: sx.brown
}
emit('base16/base16-rockabilly.yaml', `system: "base16"
name: "${NAME}"
author: "${P.author}"
variant: "dark"
palette:
${Object.entries(base16).map(([k, v]) => `  ${k}: "${v}"`).join('\n')}
`)

/* ── 9. CSS カスタムプロパティ ───────────────────────────────────────── */
const cssVars = [
  ...Object.entries(ui).map(([k, v]) => [`--rockabilly-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`, v]),
  ...Object.entries(sx).map(([k, v]) => [`--rockabilly-syntax-${k}`, v]),
  ...Object.entries(an).map(([k, v]) => [`--rockabilly-ansi-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`, v])
]
emit('css/rockabilly.css', `/* ${HEADER.replace(/\n/g, '\n   ')} */

:root[data-theme="rockabilly"], .rockabilly {
${cssVars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}
}
`)

/* ── 10. 生パレット ──────────────────────────────────────────────────── */
emit('rockabilly.palette.json', JSON.stringify(P, null, 2))

console.log(`生成 ${written.length} 件`)
written.forEach(w => console.log('  dist/' + w))
console.log('  extra_scripts/codemirror/theme/' + SLUG + '.css（アプリが読む複製）')

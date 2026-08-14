// CodeMirror のモード → prettier のパーサ。対応が無ければ null。
//
// **整形が言語を見ずに必ず markdown パーサを通していた。** シェルの
// スニペットに markdown 整形をかけると `#` 行が見出しとして扱われ、
// ブロックの間に空行が入って**コードが壊れる**（利用者からの報告）。
// 見分けは mime で行う。mode 名だけだと javascript モードが JSON も
// TypeScript も兼ねているので取り違える。

// prettier 1.19 が持つパーサだけを書く。ここに無い言語は整形しない
const MIME_TO_PARSER = {
  // Markdown（Boost Flavored Markdown = 本文エディタ）
  'text/x-bfm': 'markdown',
  'text/x-markdown': 'markdown',
  'text/markdown': 'markdown',
  'text/x-gfm': 'markdown',
  // JavaScript 系
  'text/javascript': 'babel',
  'application/javascript': 'babel',
  'application/x-javascript': 'babel',
  'application/ecmascript': 'babel',
  'text/ecmascript': 'babel',
  'text/jsx': 'babel',
  'text/babel': 'babel',
  // JSON（javascript モードだが構文は別物）
  'application/json': 'json',
  'application/x-json': 'json',
  'application/ld+json': 'json',
  'application/manifest+json': 'json',
  // TypeScript
  'text/typescript': 'typescript',
  'application/typescript': 'typescript',
  'text/typescript-jsx': 'typescript',
  // スタイル
  'text/css': 'css',
  'text/x-less': 'less',
  'text/x-scss': 'scss',
  // マークアップ・データ
  'text/html': 'html',
  'text/x-vue': 'vue',
  'text/x-yaml': 'yaml',
  'text/yaml': 'yaml',
  'application/x-yaml': 'yaml',
  'application/graphql': 'graphql',
  'text/x-graphql': 'graphql'
}

// mime が取れない構成向けの保険。mode 名は曖昧なので、
// 取り違えようのないものだけ書く
const MODE_TO_PARSER = {
  bfm: 'markdown',
  markdown: 'markdown',
  gfm: 'markdown',
  css: 'css',
  yaml: 'yaml',
  'yaml-frontmatter': 'yaml',
  vue: 'vue',
  htmlmixed: 'html'
}

/**
 * @param {string|object} mode CodeMirror の mode オプション（通常は mime 文字列）
 * @param {string} [modeName] cm.getMode().name のような解決後の名前
 * @returns {string|null} prettier のパーサ名。対応が無ければ null
 */
export function prettierParserForMode(mode, modeName) {
  const mime =
    typeof mode === 'string' ? mode : mode && mode.name ? mode.name : null
  if (mime && MIME_TO_PARSER[mime.toLowerCase()]) {
    return MIME_TO_PARSER[mime.toLowerCase()]
  }
  const name = typeof modeName === 'string' ? modeName : mime
  if (name && MODE_TO_PARSER[name.toLowerCase()]) {
    return MODE_TO_PARSER[name.toLowerCase()]
  }
  return null
}

export default prettierParserForMode

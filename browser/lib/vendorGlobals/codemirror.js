// CodeMirror must stay the window global: ~30 mode/addon <script> tags in
// lib/main.*.html register themselves on window.CodeMirror. Bundling or
// require()ing 'codemirror' would create a second instance without any modes.
// (webpack 1 did this via `externals: { codemirror: 'var CodeMirror' }`.)
module.exports = window.CodeMirror

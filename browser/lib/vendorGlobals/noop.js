// Intentionally empty. Some side-effect modules (e.g. codemirror-mode-elixir)
// are already loaded as <script> tags in lib/main.*.html so they register on
// the window.CodeMirror instance; the bundle's import is aliased here to avoid
// loading a second copy against the wrong (require()d) CodeMirror.
module.exports = {}

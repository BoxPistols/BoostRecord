(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../codemirror/lib/codemirror"), require("../codemirror/mode/gfm/gfm"), require("../codemirror/mode/yaml-frontmatter/yaml-frontmatter"))
  else if (typeof define == "function" && define.amd) // AMD
    define(["../codemirror/lib/codemirror", "../codemirror/mode/gfm/gfm", "../codemirror/mode/yaml-frontmatter/yaml-frontmatter"], mod)
  else // Plain browser env
    mod(CodeMirror)
})(function(CodeMirror) {
  'use strict'

  const fencedCodeRE = /^(~~~+|```+)[ \t]*([\w+#-]+)?(?:\(((?:\s*\w[-\w]*(?:=(?:'(?:.*?[^\\])?'|"(?:.*?[^\\])?"|(?:[^'"][^\s]*)))?)*)\))?(?::([^:]*)(?::(\d+))?)?\s*$/

  function getMode(name, params, config, cm) {
    if (!name) {
      return null
    }

    const parameters = {}
    if (params) {
      const regex = /(\w[-\w]*)(?:=(?:'(.*?[^\\])?'|"(.*?[^\\])?"|([^'"][^\s]*)))?/g

      let match
      while ((match = regex.exec(params))) {
        parameters[match[1]] = match[2] || match[3] || match[4] || null
      }
    }

    if (name === 'chart') {
      name = parameters.hasOwnProperty('yaml') ? 'yaml' : 'json'
    }

    const found = CodeMirror.findModeByName(name)
    if (!found) {
      return null
    }

    if (CodeMirror.modes.hasOwnProperty(found.mode)) {
      const mode = CodeMirror.getMode(config, found.mode)

      return mode.name === 'null' ? null : mode
    } else {
      CodeMirror.requireMode(found.mode, () => {
        cm.setOption('mode', cm.getOption('mode'))
      })
    }
  }

  CodeMirror.defineMode('bfm', function (config, baseConfig) {
    var bfmOverlay = {
      startState: function() {
        return {
          fencedEndRE: null
        }
      },
      copyState: function(s) {
        return {
          localMode: s.localMode,
          localState: s.localMode ? CodeMirror.copyState(s.localMode, s.localState) : null,

          fencedEndRE: s.fencedEndRE
        }
      },
      token: function(stream, state) {
        state.combineTokens = false

        if (state.fencedEndRE && stream.match(state.fencedEndRE)) {
          state.fencedEndRE = null
          state.localMode = null
          state.localState = null

          return null
        }

        if (state.localMode) {
          return state.localMode.token(stream, state.localState) || ''
        }

        const match = stream.match(fencedCodeRE, true)
        if (match) {
          state.fencedEndRE = new RegExp(match[1] + '+ *$')

          state.localMode = getMode(match[2], match[3], config, stream.lineOracle.doc.cm)
          if (state.localMode) {
            state.localState = CodeMirror.startState(state.localMode)
          }

          return null
        }

        state.combineTokens = true
        stream.next()
        return null
      },
    }

    baseConfig.name = 'yaml-frontmatter'
    return CodeMirror.overlayMode(CodeMirror.getMode(config, baseConfig), bfmOverlay)
  }, 'yaml-frontmatter')

  CodeMirror.defineMIME('text/x-bfm', 'bfm')

  CodeMirror.modeInfo.push({
    name: "Boost Flavored Markdown",
    mime: "text/x-bfm",
    mode: "bfm"
  })
})
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
    baseConfig.name = 'yaml-frontmatter'
    const baseMode = CodeMirror.getMode(config, baseConfig)

    return {
      startState: function() {
        return {
          baseState: CodeMirror.startState(baseMode),

          fencedEndRE: null
        }
      },
      copyState: function(s) {
        return {
          baseState: CodeMirror.copyState(baseMode, s.baseState),

          fencedMode: s.fencedMode,
          fencedState: s.fencedMode ? CodeMirror.copyState(s.fencedMode, s.fencedState) : null,

          fencedEndRE: s.fencedEndRE
        }
      },
      token: function(stream, state) {
        const initialPos = stream.pos

        if (state.fencedEndRE && stream.match(state.fencedEndRE)) {
          state.fencedEndRE = null
          state.fencedMode = null
          state.fencedState = null

          stream.pos = initialPos
          return baseMode.token(stream, state.baseState)
        }

        if (state.fencedMode) {
          return state.fencedMode.token(stream, state.fencedState)
        }

        const match = stream.match(fencedCodeRE, true)
        if (match) {
          state.fencedEndRE = new RegExp(match[1] + '+ *$')

          state.fencedMode = getMode(match[2], match[3], config, stream.lineOracle.doc.cm)
          if (state.fencedMode) {
            state.fencedState = CodeMirror.startState(state.fencedMode)
          }

          stream.pos = initialPos
          return baseMode.token(stream, state.baseState)
        }

        return baseMode.token(stream, state.baseState)
      },
      electricChars: baseMode.electricChars,
      innerMode: function(state) {
        if (state.fencedMode) {
          return {
            mode: state.fencedMode,
            state: state.fencedState
          }
        } else {
          return {
            mode: baseMode,
            state: state.baseState
          }
        }
      },
      blankLine: function(state) {
        if (state.fencedMode) {
          return state.fencedMode.blankLine && state.fencedMode.blankLine(state.fencedState)
        } else {
          return baseMode.blankLine(state.baseState)
        }
      }
    }
  }, 'yaml-frontmatter')

  CodeMirror.defineMIME('text/x-bfm', 'bfm')

  CodeMirror.modeInfo.push({
    name: "Boost Flavored Markdown",
    mime: "text/x-bfm",
    mode: "bfm"
  })
})
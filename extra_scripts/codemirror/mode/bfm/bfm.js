(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../codemirror/lib/codemirror"), require("../codemirror/mode/gfm/gfm"))
  else if (typeof define == "function" && define.amd) // AMD
    define(["../codemirror/lib/codemirror", "../codemirror/mode/gfm/gfm"], mod)
  else // Plain browser env
    mod(CodeMirror)
})(function(CodeMirror) {
  'use strict'

  CodeMirror.defineMode('bfm', function(config, gfmConfig) {
    const bfmOverlay = {
      startState() {
        return {
          inTable: false,
          rowIndex: 0
        }
      },
      copyState(s) {
        return {
          inTable: s.inTable,
          rowIndex: s.rowIndex
        }
      },
      token(stream, state) {
        state.combineTokens = true

        if (state.inTable) {
          if (stream.match(/^\|/)) {
            ++state.rowIndex

            stream.skipToEnd()

            if (state.rowIndex === 1) {
              return 'table table-separator'
            } else if (state.rowIndex % 2 === 0) {
              return 'table table-row table-row-even'
            } else {
              return 'table table-row table-row-odd'
            }
          } else {
            state.inTable = false

            stream.skipToEnd()
            return null
          }
        } else if (stream.match(/^\|/)) {
          state.inTable = true
          state.rowIndex = 0

          stream.skipToEnd()
          return 'table table-header'
        }

        stream.skipToEnd()
        return null
      },
      blankLine(state) {
        state.inTable = false
      }
    }

    gfmConfig.name = 'gfm'
    return CodeMirror.overlayMode(CodeMirror.getMode(config, gfmConfig), bfmOverlay)
  })

  CodeMirror.defineMIME('text/x-bfm', 'bfm')

  CodeMirror.modeInfo.push({
    name: "Boost Flavored Markdown",
    mime: "text/x-bfm",
    mode: "bfm"
  })
})
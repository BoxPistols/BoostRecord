import browserEnv from 'browser-env'
browserEnv(['window', 'document', 'navigator'])

// browser-env installs window/document/navigator as getter-only globals.
// Several data-layer test files set up their own jsdom by reassigning these
// globals (e.g. `global.document = require('jsdom').jsdom(...)`), which would
// throw against getter-only properties. Redefine them as writable so those
// per-file overrides take effect.
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    writable: true,
    value: global[key]
  })
}

// for CodeMirror mockup
document.body.createTextRange = function() {
  return {
    setEnd: function() {},
    setStart: function() {},
    getBoundingClientRect: function() {
      return { right: 0 }
    },
    getClientRects: function() {
      return {
        length: 0,
        left: 0,
        right: 0
      }
    }
  }
}

// browser-env's jsdom exposes window.localStorage as a getter-only
// accessor, so a plain assignment throws "Cannot set property localStorage
// of #<Window> which has only a getter". Define it as a writable,
// configurable property so the polyfill takes effect (and so individual
// test files can still override it with their own storage).
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    // polyfill
    getItem() {
      return '{}'
    }
  }
})

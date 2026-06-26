// Here you can mock the libraries connected through direct insertion <script src="" >
global.Raphael = {
  setWindow: jest.fn(),
  registerFont: jest.fn(),
  fn: function() {
    return {}
  }
}

global._ = {
  extend: jest.genMockFunction()
}

// jsdom (with a configured testURL) exposes window.localStorage as a
// getter-only accessor. Test files that inject their own storage via
// `window.localStorage = ...` would otherwise silently no-op, leaving
// findStorage() reading an empty store. Redefine it as a writable,
// configurable property so those per-test injections take effect.
const DomStorage = require('dom-storage')
Object.defineProperty(global, 'localStorage', {
  value: new DomStorage(null, { strict: false }),
  writable: true,
  configurable: true
})

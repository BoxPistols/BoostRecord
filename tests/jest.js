// Here you can mock the libraries connected through direct insertion <script src="" >
global.Raphael = {
  setWindow: jest.fn(),
  registerFont: jest.fn(),
  fn: function() {
    return {}
  }
}

global._ = {
  extend: jest.fn()
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

// jest 30のjsdomはdocument.createRange()を持つが、Rangeに寸法の関数が無い。
// jest 22のjsdomはcreateRangeが無く、CodeMirrorは寸法を測らない経路を通っていた。
// CodeMirrorが行の描画中に呼ぶので、空の寸法を返すものを補う
const { Range } = window
if (typeof Range !== 'undefined') {
  const emptyRect = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => emptyRect
  }
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null })
  }
}

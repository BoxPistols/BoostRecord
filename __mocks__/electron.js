const fs = require('fs')

class TouchBarButton {
  constructor(opts) {
    Object.assign(this, opts)
  }
}

class TouchBarSpacer {
  constructor(opts) {
    Object.assign(this, opts)
  }
}

class TouchBarPopover {
  constructor(opts) {
    Object.assign(this, opts)
  }
}

class TouchBar {
  constructor(opts) {
    this.items = (opts && opts.items) || []
  }
}
TouchBar.TouchBarButton = TouchBarButton
TouchBar.TouchBarSpacer = TouchBarSpacer
TouchBar.TouchBarPopover = TouchBarPopover

// createFromPath は実ファイルの有無を見る。生成 PNG のコミット漏れを
// テストで捕まえるため（存在しなければ isEmpty() が true になる）
const nativeImage = {
  createFromPath(p) {
    const exists = fs.existsSync(p)
    return {
      _path: p,
      _template: false,
      isEmpty: () => !exists,
      setTemplateImage(v) {
        this._template = v
      },
      isTemplateImage() {
        return this._template
      }
    }
  }
}

module.exports = {
  require: jest.genMockFunction(),
  match: jest.genMockFunction(),
  app: jest.genMockFunction(),
  remote: jest.genMockFunction(),
  dialog: jest.genMockFunction(),
  nativeImage,
  TouchBar
}

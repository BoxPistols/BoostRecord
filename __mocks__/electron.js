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

module.exports = {
  require: jest.genMockFunction(),
  match: jest.genMockFunction(),
  app: jest.genMockFunction(),
  remote: jest.genMockFunction(),
  dialog: jest.genMockFunction(),
  TouchBar
}

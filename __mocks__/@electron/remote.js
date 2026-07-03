// Manual mock for `@electron/remote` (jest auto-uses files under __mocks__/ for
// node_modules requires). browser/ now requires `@electron/remote` directly; its
// real renderer entry calls a native binding (electron_common_features) that does
// not exist in plain Node, so every suite that loads browser code crashed on
// require. This stubs the surface used at module-load time.
const noop = jest.fn()

// `remote.require('electron')` must return an object: browser code destructures
// Menu/clipboard/shell from it at module-load, which crashes on undefined.
function Menu() {}
Menu.buildFromTemplate = noop
Menu.setApplicationMenu = noop
const electronStub = {
  Menu,
  MenuItem: function() {},
  clipboard: { writeText: noop, readText: noop },
  shell: { openExternal: noop, openItem: noop },
  dialog: {
    showOpenDialog: noop,
    showSaveDialog: noop,
    showMessageBox: noop,
    showErrorBox: noop
  },
  app: { getPath: noop, getAppPath: noop }
}

module.exports = {
  require: jest.fn(() => electronStub),
  getGlobal: noop,
  getCurrentWindow: noop,
  getCurrentWebContents: noop,
  app: {
    getPath: noop,
    getAppPath: noop,
    getName: noop,
    getVersion: noop
  },
  dialog: {
    showOpenDialog: noop,
    showSaveDialog: noop,
    showMessageBox: noop
  },
  shell: {
    openExternal: noop,
    openItem: noop
  },
  process: { argv: [], env: {} }
}

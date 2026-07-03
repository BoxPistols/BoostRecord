// Electron 14+ removed the built-in `electron.remote`. We migrated our own code
// to `@electron/remote`, but some bundled dependencies (e.g. electron-config)
// still read `electron.remote.app` directly. Alias it once, as early as possible
// (this module is imported first in the renderer entry), so that legacy code
// keeps working without patching node_modules.
const electron = require('electron')

if (electron && !electron.remote) {
  try {
    Object.defineProperty(electron, 'remote', {
      value: require('@electron/remote'),
      configurable: true,
      writable: true
    })
  } catch (e) {
    // @electron/remote not available (e.g. unit tests / main process) — ignore.
  }
}

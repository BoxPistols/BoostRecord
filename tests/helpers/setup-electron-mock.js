import mock from 'mock-require'

const noop = () => {}

mock('electron', {
  remote: {
    app: {
      getAppPath: noop,
      getPath: noop
    }
  }
})

// browser/ now requires `@electron/remote` directly (electron.remote was removed
// in modern Electron). In plain Node its renderer entry calls a native binding
// that doesn't exist, crashing dataApi tests on load — so mock it with the same
// stub as electron.remote above.
mock('@electron/remote', {
  app: {
    getAppPath: noop,
    getPath: noop
  }
})

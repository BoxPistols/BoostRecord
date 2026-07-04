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

// These deps moved to ESM-only majors (2026-07 dep wave). ava runs through
// babel-register, whose require hook cannot execute ESM — point them at the
// same CJS shims jest uses (see package.json jest.moduleNameMapper).
mock('escape-string-regexp', require('../shims/escape-string-regexp'))
mock('file-url', require('../shims/file-url'))
mock('filenamify', require('../shims/filenamify'))
mock('query-string', require('../shims/query-string'))

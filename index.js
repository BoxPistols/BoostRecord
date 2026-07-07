const { app } = require('electron')
const ChildProcess = require('child_process')
const path = require('path')

// E2E probe hook: when TB_E2E_PROBE points to a main-process script, load it
// before the app boots (used by `npm run e2e` and the CI smoke workflows to
// drive the real renderer). No-op in normal runs.
if (process.env.TB_E2E_PROBE) {
  require(path.resolve(process.env.TB_E2E_PROBE))
}

var error = null

function execMainApp() {
  const appRootPath = path.join(process.execPath, '../..')
  const updateDotExePath = path.join(appRootPath, 'Update.exe')
  const exeName = path.basename(process.execPath)

  function spawnUpdate(args, cb) {
    var stdout = ''
    var updateProcess = null
    try {
      updateProcess = ChildProcess.spawn(updateDotExePath, args)
    } catch (e) {
      process.nextTick(function() {
        cb(e)
      })
    }

    updateProcess.stdout.on('data', function(data) {
      stdout += data
    })

    updateProcess.on('error', function(_error) {
      error = _error
    })
    updateProcess.on('close', function(code, signal) {
      if (code !== 0) {
        error = new Error('Command failed: #{signal ? code}')
        error.code = code
        error.stdout = stdout
      }

      cb(error, stdout)
    })
  }

  var handleStartupEvent = function() {
    if (process.platform !== 'win32') {
      return false
    }

    var squirrelCommand = process.argv[1]
    switch (squirrelCommand) {
      case '--squirrel-install':
        spawnUpdate(['--createShortcut', exeName], function(err) {
          if (err) console.error(err)
          app.quit()
        })
        return true
      case '--squirrel-updated':
        app.quit()
        return true
      case '--squirrel-uninstall':
        spawnUpdate(['--removeShortcut', exeName], function(err) {
          if (err) console.error(err)
          app.quit()
        })
        return true
      case '--squirrel-obsolete':
        app.quit()
        return true
    }
  }

  if (handleStartupEvent()) {
    return
  }

  require('./lib/main-app')
}

execMainApp()

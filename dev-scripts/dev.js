const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')
const config = require('../webpack.config')
const signale = require('signale')
const { spawn } = require('child_process')
const electron = require('electron')
const port = 8080
let server = null
let firstRun = true

const options = {
  publicPath: config.output.publicPath,
  hot: true,
  inline: true,
  quiet: true
}

function startServer() {
  config.plugins.push(new webpack.HotModuleReplacementPlugin())
  config.entry.main.unshift(
    `webpack-dev-server/client?http://localhost:${port}/`,
    'webpack/hot/dev-server'
  )
  const compiler = webpack(config)
  server = new WebpackDevServer(compiler, options)

  return new Promise((resolve, reject) => {
    server.listen(port, 'localhost', function(err) {
      if (err) {
        reject(err)
      }
      signale.success(`Webpack Dev Server listening at localhost:${port}`)
      signale.watch(`Waiting for webpack to bundle...`)
      compiler.plugin('done', stats => {
        if (!stats.hasErrors()) {
          signale.success(`Bundle success !`)
          resolve()
        } else {
          if (!firstRun) {
            console.log(stats.compilation.errors[0])
          } else {
            firstRun = false
            reject(stats.compilation.errors[0])
          }
        }
      })
    })
  })
}

function startElectron() {
  // webpack (this Node process) needs --openssl-legacy-provider in NODE_OPTIONS
  // for its legacy md4 hashing, but Electron (BoringSSL) REJECTS that flag and
  // refuses to start. Strip it from the child's env so only webpack keeps it.
  const env = { ...process.env }
  if (env.NODE_OPTIONS) {
    env.NODE_OPTIONS = env.NODE_OPTIONS.replace(
      /--openssl-legacy-provider/g,
      ''
    ).trim()
    if (!env.NODE_OPTIONS) delete env.NODE_OPTIONS
  }
  // '.' (not './index.js'): pointing Electron at a file runs the "default
  // app" wrapper, where app.getVersion() reports Electron's own version.
  spawn(electron, ['--hot', '.'], { stdio: 'inherit', env })
    .on('close', () => {
      server.close()
    })
    .on('error', err => {
      signale.error(err)
      server.close()
    })
    .on('disconnect', () => {
      server.close()
    })
    .on('exit', () => {
      server.close()
    })
}

startServer()
  .then(() => {
    startElectron()
    signale.success('Electron started')
  })
  .catch(err => {
    signale.error(err)
    process.exit(1)
  })

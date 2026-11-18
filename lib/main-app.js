const electron = require('electron')
const app = electron.app
const Menu = electron.Menu
// electron.crashReporter.start()
const singleInstance = app.requestSingleInstanceLock()

var ipcServer = null

var mainWindow = null

// Single Instance Lock
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, it should focus the existing instance.
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.on('window-all-closed', function() {
  app.quit()
})

app.on('ready', function() {
  mainWindow = require('./main-window')

  var template = require('./main-menu')
  var menu = Menu.buildFromTemplate(template)
  switch (process.platform) {
    case 'darwin': {
      Menu.setApplicationMenu(menu)
      // Touch Bar はフォーカスがある時だけ表示する。macOS は前面アプリの
      // バーを出す仕様だが、blur で明示的に外して確実にする
      const touchBarMenu = require('./touchbar-menu').build().touchBar
      mainWindow.setTouchBar(touchBarMenu)
      mainWindow.on('focus', () => mainWindow.setTouchBar(touchBarMenu))
      mainWindow.on('blur', () => mainWindow.setTouchBar(null))
      break
    }
    case 'win32':
      mainWindow.setMenu(menu)
      break
    case 'linux':
      Menu.setApplicationMenu(menu)
      mainWindow.setMenu(menu)
  }

  // 更新の確認とmacOSのアプリ内更新（lib/app-updater.js）
  require('./app-updater').start(mainWindow)

  ipcServer = require('./ipcServer')
  ipcServer.server.start()

  // Inline AI writing-assist (OpenAI / Gemini): main-process streaming endpoint.
  require('./ai/ipc').registerAiIpc()

  // VOICEVOX text-to-speech: main-process → localhost:50021 → WAV → renderer.
  require('./tts/ipc').registerTtsIpc()

  // Bookmark-card page screenshots: hidden sandboxed window → PNG data URL.
  require('./screenshot/ipc').registerScreenshotIpc()

  // YouTubeの埋め込みプレーヤー：file://からはRefererが付かず再生できないので補う
  require('./youtube/referer').registerYouTubeReferer(
    electron.session.defaultSession
  )
})

module.exports = app

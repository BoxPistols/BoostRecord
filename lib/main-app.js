const electron = require('electron')
const app = electron.app
const Menu = electron.Menu
const ipc = electron.ipcMain
const shell = electron.shell
const { isPackaged } = app
const electronConfig = new (require('electron-config'))()
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

// 2026-07: the old electron-gh-releases updater pointed at the dead upstream
// repo (BoostIO/boost-releases) and its Squirrel backend can't apply updates
// to an unsigned mac app anyway. Replaced with a plain GitHub "newer release
// exists?" check that opens the download — works unsigned, no deps.
// 2026-10: open the installer for this CPU directly instead of the release
// page; picking from 3 files each update put arm64 builds on Intel Macs.
// 2026-11: macOSでは、Squirrelを通さずにzipを取得・検査してアプリ自身を置き換える
// （lib/self-update.js）。置き換えられない場所とWindows・Linuxは、これまでどおり
// インストーラーをブラウザで開く
const UPDATE_REPO = 'BoxPistols/BoostRecord'
const UPDATE_USER_AGENT = 'boostrecord-update-check'
let latestReleaseUrl = `https://github.com/${UPDATE_REPO}/releases/latest`
const {
  classifyUpdateResponse,
  shouldCheckNow,
  shouldNotify,
  selfReplaceBlocker,
  appBundlePath,
  pickZipAsset,
  pickDownloadUrl,
  hostArch
} = require('./update-check')
const selfUpdate = require('./self-update')

// 見つけた新しいバージョン（{ release, version }）。失敗した確認では消さない
let availableUpdate = null
// 取得と検査を終え、置き換えを待っているバージョン
let stagedUpdate = null
// 確認・取得・置き換えの最中は要求を重ねない
let updateBusy = false
// 画面側が知らせを受け取れる状態か。起動直後に送ると、画面の読み込みが終わる前で
// 受け口が無く、知らせが消えたまま「知らせた」と記録されてしまう
let rendererReady = false

function sendToWindow(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function currentArch() {
  return hostArch(process.arch, app.runningUnderARM64Translation)
}

// 知らせは「更新して再起動するか」の1回だけにする。置き換えられる時は、
// 知らせる前に裏でダウンロードと検査を済ませ、承諾されたらすぐ置き換えられるようにする
async function notifyUpdateFound(manualTriggered) {
  // 画面側の準備ができてから送る（update-checkを受けた時にもう一度呼ばれる）
  if (!rendererReady || updateBusy || !availableUpdate) return
  const update = availableUpdate
  if (
    !shouldNotify(
      update.version,
      electronConfig.get('updateNotifiedVersion'),
      manualTriggered
    )
  ) {
    return
  }
  const target = await selfUpdateTarget()
  if (!target) {
    // 置き換えられない場所やWindows・Linuxは、インストーラーをブラウザで開く
    electronConfig.set('updateNotifiedVersion', update.version)
    sendToWindow('update-found')
    return
  }
  if (!stagedUpdate || stagedUpdate.version !== update.version) {
    updateBusy = true
    try {
      stagedUpdate = await selfUpdate.downloadAndVerify({
        url: target.zipUrl,
        version: update.version,
        currentAppPath: target.appPath,
        userAgent: UPDATE_USER_AGENT
      })
      updateBusy = false
    } catch (err) {
      // 自動の確認で失敗した時は黙って次の確認を待つ。手で確認した時だけ理由を出す
      if (manualTriggered) {
        reportUpdateError(err)
      } else {
        updateBusy = false
        console.error('Self-update download failed: %s', err.message)
      }
      return
    }
    // 取得の間に別のバージョンが見つかっていたら、この知らせは出さない
    if (availableUpdate !== update) return
  }
  electronConfig.set('updateNotifiedVersion', update.version)
  sendToWindow('update-ready', {
    version: update.version,
    current: app.getVersion()
  })
}

function checkUpdate(manualTriggered = false) {
  if (!isPackaged) {
    // Prevents app from attempting to update when in dev mode.
    console.log('Updates are disabled in Development mode, see main-app.js')
    return true
  }

  // End if auto updates disabled and it is an automatic check
  if (!electronConfig.get('autoUpdateEnabled', true) && !manualTriggered) return

  if (updateBusy) return

  if (
    !manualTriggered &&
    !shouldCheckNow(electronConfig.get('updateLastSuccessAt'), Date.now())
  ) {
    return
  }

  updateBusy = true
  // releases/latestではなく一覧を見る。同じリポジトリのapp-v*がLatestになっても
  // 旧アプリの更新が隠れないように
  fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=30`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': UPDATE_USER_AGENT
    }
  })
    .then(res =>
      res
        .json()
        .catch(() => null)
        .then(body =>
          classifyUpdateResponse(res.status, body, app.getVersion())
        )
    )
    .catch(err => {
      console.error('Updater error! %s', err.message)
      return { kind: 'failed' }
    })
    .then(result => {
      updateBusy = false
      if (result.kind === 'failed') {
        // 時刻を進めず、既に知っている更新も消さない。1時間後にまた確かめる
        if (manualTriggered) sendToWindow('update-check-failed')
        return
      }
      electronConfig.set('updateLastSuccessAt', Date.now())
      if (result.kind === 'latest') {
        availableUpdate = null
        dropStagedUpdate()
        if (manualTriggered) {
          sendToWindow('update-not-found', 'There is no newer version.')
        }
        return
      }
      if (!availableUpdate || availableUpdate.version !== result.version) {
        dropStagedUpdate()
      }
      availableUpdate = { release: result.release, version: result.version }
      latestReleaseUrl =
        pickDownloadUrl(result.release, process.platform, currentArch()) ||
        result.release.html_url ||
        latestReleaseUrl
      notifyUpdateFound(manualTriggered)
    })
}

// 展開して置き換えを待っているものを捨てる（一時ディレクトリも消す）
function dropStagedUpdate() {
  if (stagedUpdate) selfUpdate.discardStaged(stagedUpdate).catch(() => {})
  stagedUpdate = null
}

// この場で置き換えられるか。置き換えられない時はブラウザでインストーラーを開く。
// 書き込めるかは取得の前に見る。約100MBを取ってから失敗に気づかないように
async function selfUpdateTarget() {
  if (!availableUpdate) return null
  const appPath = appBundlePath(process.execPath)
  if (selfReplaceBlocker(appPath, process.platform)) return null
  const zipUrl = pickZipAsset(availableUpdate.release, currentArch())
  if (!zipUrl) return null
  if (!(await selfUpdate.canWriteParent(appPath))) return null
  return { appPath, zipUrl }
}

function reportUpdateError(err) {
  updateBusy = false
  console.error('Self-update failed: %s', err.message)
  if (err instanceof selfUpdate.UpdateError) {
    sendToWindow('update-error', { key: err.i18nKey, args: err.i18nArgs })
  } else {
    sendToWindow('update-error', { key: '%s', args: [err.message] })
  }
}

// 置き換えられない時の知らせから呼ばれる。インストーラーをブラウザで開く
ipc.on('update-download-confirm', () => {
  shell.openExternal(latestReleaseUrl)
})

ipc.on('update-app-confirm', async () => {
  if (updateBusy) return
  const target = await selfUpdateTarget()
  if (!target || !stagedUpdate) {
    shell.openExternal(latestReleaseUrl)
    return
  }
  updateBusy = true
  selfUpdate
    .replaceApp(stagedUpdate, target.appPath)
    .then(backup => {
      // 置き換えたら新しいウィンドウを開かずにすぐ終了する。旧アプリの場所は退避名に
      // 変わっていて、Electronが後からヘルパーを起動すると見つからないため
      stagedUpdate = null
      selfUpdate.relaunchAfterExit(target.appPath, backup)
      app.quit()
    })
    .catch(reportUpdateError)
})

// 置き換えずに終了した時は、展開したものを残さない
app.on('will-quit', function() {
  if (stagedUpdate) {
    require('fs').rmSync(stagedUpdate.work, { recursive: true, force: true })
    stagedUpdate = null
  }
})

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

  // スリープを挟むと24時間おきのタイマーは当てにならないので、1時間ごとに
  // 前回の成功から24時間たったかを見る（checkUpdateの中で判定する）
  setInterval(function() {
    if (isPackaged) checkUpdate()
  }, 1000 * 60 * 60)

  // 画面側は読み込みが終わると'check-update'を、手で確認した時は'manual'を送ってくる
  ipc.on('update-check', function(event, msg) {
    rendererReady = true
    const manual = msg === 'manual'
    // 見つけてあるのに知らせていなければ、ここで知らせる
    if (availableUpdate && !manual) {
      notifyUpdateFound(false)
      return
    }
    checkUpdate(manual)
  })

  // Check update after 10 secs to prevent file locking of Windows
  setTimeout(() => {
    if (isPackaged) checkUpdate()
  }, 10 * 1000)
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

// アプリ自身の更新。GitHub Releasesを見て、新しいバージョンがあれば知らせる。
//
// 2026-07: the old electron-gh-releases updater pointed at the dead upstream
// repo (BoostIO/boost-releases) and its Squirrel backend can't apply updates
// to an unsigned mac app anyway. Replaced with a plain GitHub "newer release
// exists?" check that opens the download — works unsigned, no deps.
// 2026-10: open the installer for this CPU directly instead of the release
// page; picking from 3 files each update put arm64 builds on Intel Macs.
// 2026-11: macOSではzipを取ってきて自前で置き換える（mac-update-install.js）。
// 見つけたらDockの赤いバッジと画面右下の「更新する」で知らせ、利用者が選んだ
// 「更新の方法」に従って、バージョンごとに1回だけ聞くか、聞かずに置き換える。
// WindowsとLinuxは従来どおりインストーラかReleaseのページを開く。
const electron = require('electron')
const { app, ipcMain: ipc, shell, Menu, Notification, dialog } = electron
const fs = require('fs')
const path = require('path')
const electronConfig = new (require('electron-config'))()
const {
  isNewerVersion,
  hostArch,
  normalizeUpdateMode,
  parseRelease,
  updateAction,
  restartBlocker,
  appBundlePath,
  canReplaceAt,
  postInstallResult
} = require('./update-check')

const UPDATE_REPO = 'BoxPistols/BoostRecord'
const FALLBACK_URL = `https://github.com/${UPDATE_REPO}/releases/latest`

// electron-configのキー。autoUpdateEnabledは以前から「自動で確かめるか」を持つ
// （既定はtrue）。方法はそれとは別に持ち、既存の利用者の値は読み替えない
const KEY_AUTO_CHECK = 'autoUpdateEnabled'
const KEY_MODE = 'updateMode'
const KEY_PROMPTED = 'updatePromptedVersion'
// 置き換えの直前に残す{ version, auto }。開き直した後に結果を知らせるのに使う
const KEY_PENDING = 'updatePendingInstall'

const isMac = process.platform === 'darwin'

let mainWindow = null
// 見つけた新しいバージョン（parseReleaseの戻り値）
let available = null
let busy = false
let checking = false
// 自動の更新に失敗した理由。ダイアログは出さず、画面右下の表示に添える
let lastError = null
// 編集中などで自動の更新を見送ったか。見送ったときだけ1時間ごとに試し直す
// （失敗したときは次の日の確認まで待ち、壊れたzipを何度も取りに行かない）
let autoDeferred = false

function getMode() {
  return normalizeUpdateMode(electronConfig.get(KEY_MODE))
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function currentAppPath() {
  return isMac ? appBundlePath(process.execPath) : null
}

// アプリ内で置き換えられるか。書き込めない場所（管理者だけが書ける場所など）は
// 置き換えの途中で失敗するので、最初からページを開く扱いにする
function canInstall(release) {
  if (!isMac || !release || !release.zip) return false
  const appPath = currentAppPath()
  if (!canReplaceAt(appPath)) return false
  try {
    fs.accessSync(path.dirname(appPath), fs.constants.W_OK)
    fs.accessSync(appPath, fs.constants.W_OK)
    return true
  } catch (e) {
    return false
  }
}

function showAvailable() {
  if (isMac && app.dock) app.dock.setBadge(available ? '•' : '')
  send('update-available', {
    version: available ? available.version : null,
    busy,
    error: lastError
  })
}

function checkUpdate(manualTriggered = false) {
  if (!app.isPackaged) {
    // Prevents app from attempting to update when in dev mode.
    console.log('Updates are disabled in Development mode, see app-updater.js')
    return
  }
  // 自動で確かめない設定なら、手で「更新を確認」したときだけ確かめる
  if (!electronConfig.get(KEY_AUTO_CHECK, true) && !manualTriggered) return
  if (checking || busy) return
  checking = true

  fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'boostrecord-update-check'
    }
  })
    .then(res => {
      if (!res.ok) throw new Error(`GitHub API responded ${res.status}`)
      return res.json()
    })
    .then(json => {
      checking = false
      const release = parseRelease(
        json,
        process.platform,
        hostArch(process.arch, app.runningUnderARM64Translation)
      )
      if (release && isNewerVersion(release.version, app.getVersion())) {
        if (!available || available.version !== release.version) {
          lastError = null
        }
        available = release
        showAvailable()
        handle(manualTriggered)
      } else {
        available = null
        lastError = null
        showAvailable()
        if (manualTriggered) {
          send('update-not-found', 'There is no newer version.')
        }
      }
    })
    .catch(err => {
      checking = false
      console.error('Updater error! %s', err.message)
      if (manualTriggered) send('update-not-found', 'Updater error')
    })
}

function handle(manual) {
  if (!available || busy) return
  const installable = canInstall(available)
  const action = updateAction({
    mode: getMode(),
    manual,
    canInstall: installable,
    alreadyPrompted: electronConfig.get(KEY_PROMPTED) === available.version
  })
  if (action === 'install') {
    install(true)
  } else if (action === 'prompt') {
    electronConfig.set(KEY_PROMPTED, available.version)
    send('update-found', {
      version: available.version,
      canInstall: installable
    })
  }
}

// 画面側に、開き直してよいかを聞く。flushなら保留中の保存を先に書き込ませる。
// 答えが来なければnull（同期のダイアログで止まっているときなど）
let querySeq = 0
function askRenderer(flush) {
  return new Promise(resolve => {
    if (!mainWindow || mainWindow.isDestroyed()) return resolve(null)
    const id = ++querySeq
    const timer = setTimeout(() => done(null), 10 * 1000)
    function onReply(e, reply) {
      if (reply && reply.id === id) done(reply)
    }
    function done(reply) {
      clearTimeout(timer)
      ipc.removeListener('update-restart-reply', onReply)
      resolve(reply)
    }
    ipc.on('update-restart-reply', onReply)
    mainWindow.webContents.send('update-restart-query', { id, flush })
  })
}

const BLOCKER_MESSAGES = {
  'no-answer':
    '画面から応答がありませんでした。開いているダイアログを閉じてから、もう一度試してください。',
  unsaved:
    '保存していない編集があります。保存が済んでから、もう一度試してください。',
  modal:
    '開いている画面（設定やAIの窓など）を閉じてから、もう一度試してください。'
}

async function readyToRestart(auto) {
  // 手で更新するときは、保留中の保存を書き込んでから確かめる。
  // 自動のときは書き込ませず、保留中なら見送る（打っている最中なので）
  const reply = await askRenderer(!auto)
  return restartBlocker({
    auto,
    reply,
    idleSeconds: electron.powerMonitor.getSystemIdleTime()
  })
}

function fail(auto, message) {
  lastError = message
  if (!auto) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      message: '更新できませんでした',
      detail: message
    })
  }
}

// autoは自動の更新から。失敗してもダイアログは出さず、バッジと画面右下の表示を
// 残して次の機会に任せる
async function install(auto) {
  if (busy || !available) return
  const release = available
  if (!canInstall(release)) {
    shell.openExternal(release.downloadUrl || release.pageUrl || FALLBACK_URL)
    return
  }
  // 取ってくる前に一度確かめる。打っている最中に150MB近く取りに行っても、
  // 最後の確認で見送ることになる
  const early = auto ? await readyToRestart(true) : null
  if (early) {
    autoDeferred = true
    return
  }
  autoDeferred = false
  busy = true
  lastError = null
  showAvailable()
  const installer = require('./mac-update-install')
  const appPath = currentAppPath()
  let prepared = null
  try {
    prepared = await installer.prepare({
      zip: release.zip,
      ymlUrl: release.ymlUrl,
      version: release.version,
      appPath
    })
  } catch (e) {
    busy = false
    fail(auto, e.message)
    showAvailable()
    return
  }

  const blocker = await readyToRestart(auto)
  if (blocker) {
    fs.rmSync(prepared.workDir, { recursive: true, force: true })
    busy = false
    if (auto) autoDeferred = true
    else fail(false, BLOCKER_MESSAGES[blocker] || blocker)
    showAvailable()
    return
  }

  try {
    electronConfig.set(KEY_PENDING, { version: release.version, auto })
    installer.launchSwap({
      workDir: prepared.workDir,
      stagedApp: prepared.stagedApp,
      appPath,
      pid: process.pid,
      // 自動のときは開き直しても前に出さない。別のアプリで作業中かもしれない
      background: auto,
      logPath: path.join(app.getPath('userData'), 'update.log')
    })
  } catch (e) {
    electronConfig.delete(KEY_PENDING)
    fs.rmSync(prepared.workDir, { recursive: true, force: true })
    busy = false
    fail(auto, `置き換えの処理を始められませんでした（${e.message}）`)
    showAvailable()
    return
  }
  app.quit()
}

// 開き直した直後に、前回の更新の結果を1回だけ知らせる。
// 黙ってバージョンが変わると、動きが変わったときに原因へたどり着けない
function announcePreviousInstall() {
  const result = postInstallResult(
    electronConfig.get(KEY_PENDING),
    app.getVersion()
  )
  electronConfig.delete(KEY_PENDING)
  if (!result) return
  if (result.kind === 'installed') {
    if (result.auto && Notification.isSupported()) {
      new Notification({
        title: `BoostRecordを${result.version}に更新しました`,
        body: '更新の方法はメニューの「更新の方法」で変えられます。'
      }).show()
    }
    return
  }
  const message = `${result.version}への置き換えに失敗したので、元のバージョンに戻しました。`
  fail(result.auto, message)
}

function setMode(mode) {
  electronConfig.set(KEY_MODE, normalizeUpdateMode(mode))
  syncMenu()
  // 自動に切り替えた時点で知っている更新があれば、そのまま進める
  handle(false)
}

function syncMenu() {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  const item = menu.getMenuItemById(`update-mode-${getMode()}`)
  if (item) item.checked = true
}

function start(win) {
  mainWindow = win
  announcePreviousInstall()

  // Check update every day
  setInterval(() => {
    autoDeferred = false
    checkUpdate()
  }, 1000 * 60 * 60 * 24)

  // 編集中で見送った自動の更新を、1時間ごとに試し直す（通信はしない）
  setInterval(() => {
    if (autoDeferred && getMode() === 'auto') handle(false)
  }, 1000 * 60 * 60)

  ipc.on('update-download-confirm', () => {
    if (!available) return
    if (canInstall(available)) install(false)
    else {
      // Unsigned builds can't self-install; open the installer for this CPU
      // (or the release page when no asset matched) in the browser.
      shell.openExternal(available.downloadUrl || FALLBACK_URL)
    }
  })
  // 以前の画面との互換のため残す（「Restart & Install」から呼ばれる）
  ipc.on('update-app-confirm', () => {
    shell.openExternal(
      (available && (available.downloadUrl || available.pageUrl)) ||
        FALLBACK_URL
    )
  })
  ipc.on('update-cancel', () => {})
  ipc.on('update-set-mode', (e, mode) => setMode(mode))
  ipc.on('update-get-state', e => {
    e.returnValue = { mode: getMode(), supported: isMac }
  })

  // Check update after 10 secs to prevent file locking of Windows
  setTimeout(() => {
    checkUpdate()

    ipc.on('update-check', function(event, msg) {
      if (available && msg === 'manual') {
        handle(true)
      } else if (available) {
        showAvailable()
      } else {
        checkUpdate(msg === 'manual')
      }
    })
  }, 10 * 1000)
}

module.exports = { start, setMode, getMode, checkUpdate }

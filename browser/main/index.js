// Must be first: aliases the removed electron.remote → @electron/remote before
// any other module (electron-config, consts, …) reads electron.remote.*.
import 'browser/lib/remoteShim'
import { Provider } from 'react-redux'
import Main from './Main'
import { store, history } from './store'
import React, { Fragment } from 'react'
import ReactDOM from 'react-dom'
// Global (unscoped) stylesheet — Vite handles plain .styl imports globally;
// the webpack-1 inline-loader chain (`!!style!css!stylus!`) is gone.
require('./global.styl')
import config from 'browser/main/lib/ConfigManager'
import { Route, Switch, Redirect } from 'react-router-dom'
import { ConnectedRouter } from 'connected-react-router'
import DevTools from './DevTools'

require('./lib/ipcClient')
require('../lib/customMeta')
import i18n from 'browser/lib/i18n'
import ConfigManager from './lib/ConfigManager'
import { saveLastRoute, readLastRoute } from './lib/lastRoute'
import { hasPendingSave, flushPendingSaves } from './lib/pendingSaves'
import { isModalOpen } from './lib/modal'

const electron = require('electron')

const { ipcRenderer } = electron
const remote = require('@electron/remote')
const { dialog } = remote

document.addEventListener('drop', function(e) {
  e.preventDefault()
  e.stopPropagation()
})
document.addEventListener('dragover', function(e) {
  e.preventDefault()
  e.stopPropagation()
})

// prevent menu from popup when alt pressed
// but still able to toggle menu when only alt is pressed
let isAltPressing = false
let isAltWithMouse = false
let isAltWithOtherKey = false
let isOtherKey = false

document.addEventListener('keydown', function(e) {
  if (e.key === 'Alt') {
    isAltPressing = true
    if (isOtherKey) {
      isAltWithOtherKey = true
    }
  } else {
    if (isAltPressing) {
      isAltWithOtherKey = true
    }
    isOtherKey = true
  }
})

document.addEventListener('mousedown', function(e) {
  if (isAltPressing) {
    isAltWithMouse = true
  }
})

document.addEventListener('keyup', function(e) {
  if (e.key === 'Alt') {
    if (isAltWithMouse || isAltWithOtherKey) {
      e.preventDefault()
    }
    isAltWithMouse = false
    isAltWithOtherKey = false
    isAltPressing = false
    isOtherKey = false
  }
})

document.addEventListener('click', function(e) {
  const className = e.target.className
  if (!className && typeof className !== 'string') return
  const isInfoButton = className.includes('infoButton')
  const offsetParent = e.target.offsetParent
  const isInfoPanel =
    offsetParent !== null ? offsetParent.className.includes('infoPanel') : false
  if (isInfoButton || isInfoPanel) return
  const infoPanel = document.querySelector('.infoPanel')
  if (infoPanel) infoPanel.style.display = 'none'
})

if (!config.get().ui.showScrollBar) {
  document.styleSheets[54].insertRule('::-webkit-scrollbar {display: none}')
  document.styleSheets[54].insertRule(
    '::-webkit-scrollbar-corner {display: none}'
  )
  document.styleSheets[54].insertRule(
    '::-webkit-scrollbar-thumb {display: none}'
  )
}

const el = document.getElementById('content')

function notify(...args) {
  return new window.Notification(...args)
}

function updateApp() {
  const index = dialog.showMessageBoxSync(remote.getCurrentWindow(), {
    type: 'warning',
    message: i18n.__('Update BoostRecord'),
    detail: i18n.__('New BoostRecord is ready to be installed.'),
    buttons: [i18n.__('Restart & Install'), i18n.__('Not Now')]
  })

  if (index === 0) {
    ipcRenderer.send('update-app-confirm')
  }
}

// infoはlib/app-updater.jsから届く{ version, canInstall }。canInstallなら
// アプリの中で置き換えて開き直し、そうでなければインストーラかページを開く
function downloadUpdate(info) {
  const canInstall = !!(info && info.canInstall)
  const version = info && info.version ? info.version : ''
  const index = dialog.showMessageBoxSync(remote.getCurrentWindow(), {
    type: 'warning',
    message: version
      ? i18n.__('BoostRecord %s is available', version)
      : i18n.__('Update BoostRecord'),
    detail: canInstall
      ? i18n.__(
          'BoostRecord will download the update, then quit and reopen. You can also update later from the button at the bottom right.'
        )
      : i18n.__('New BoostRecord is ready to be downloaded.'),
    // 「今回は見送る」と「今後いっさい通知しない」を分ける。以前は選択肢が
    // 2 つしかなく、後者しか無かったため、一度スキップしたユーザーは二度と
    // 更新通知を受け取れなかった
    buttons: [
      canInstall ? i18n.__('Update now') : i18n.__('Download now'),
      i18n.__('Not Now'),
      i18n.__('Stop notifying me')
    ],
    defaultId: 0,
    // Esc は「今回は見送る」に倒す。cancelId を指定しないと 0 が返り、
    // 閉じたつもりでダウンロードが始まる
    cancelId: 1
  })

  if (index === 0) {
    ipcRenderer.send('update-download-confirm')
  } else if (index === 1) {
    // ダイアログはバージョンごとに1回だけ。以降は右下の「更新する」とDockのバッジで知らせる
    ipcRenderer.send('update-cancel')
  } else if (index === 2) {
    ipcRenderer.send('update-cancel')
    ConfigManager.set({ autoUpdateEnabled: false })
  }
}

// 起動時に開くルートは render 前に一度だけ決める。描画中に読み直すと
// 遷移のたびに初期値が変わってしまう
const initialRoute = readLastRoute()
// 以降の遷移を保存する。history.listen は unlisten を返すが、
// このリスナはウィンドウと寿命を共にするので解除しない
history.listen(location => saveLastRoute(location))

ReactDOM.render(
  <Provider store={store}>
    <ConnectedRouter history={history}>
      <Fragment>
        <Switch>
          {/* 起動時は最後に見ていたページへ戻す（未保存 / 未知の形なら /home） */}
          <Redirect path='/' to={initialRoute} exact />
          <Route
            path='/(home|alltags|starred|bookmarked|trashed)'
            component={Main}
          />
          <Route path='/searched' component={Main} exact />
          <Route path='/searched/:searchword' component={Main} />
          <Redirect path='/tags' to='/alltags' exact />
          <Route path='/tags/:tagname' component={Main} />

          {/* storages */}
          <Redirect path='/storages' to='/home' exact />
          <Route path='/storages/:storageKey' component={Main} exact />
          <Route
            path='/storages/:storageKey/folders/:folderKey'
            component={Main}
          />
        </Switch>
        <DevTools />
      </Fragment>
    </ConnectedRouter>
  </Provider>,
  el,
  function() {
    const loadingCover = document.getElementById('loadingCover')
    loadingCover.parentNode.removeChild(loadingCover)

    ipcRenderer.on('update-ready', function() {
      store.dispatch({
        type: 'UPDATE_AVAILABLE'
      })
      notify('Update ready!', {
        body: 'New BoostRecord is ready to be installed.'
      })
      updateApp()
    })

    ipcRenderer.on('update-found', function(_, info) {
      downloadUpdate(info)
    })

    // 新しいバージョンの有無と、更新の進み具合。右下の表示に使う
    ipcRenderer.on('update-available', function(_, info) {
      store.dispatch({
        type: info && info.version ? 'UPDATE_AVAILABLE' : 'UPDATE_CLEARED',
        version: info && info.version,
        busy: !!(info && info.busy),
        error: (info && info.error) || null
      })
    })

    // アプリ内更新で開き直してよいかの問い合わせ。flushなら保留中の保存を先に書き込む
    ipcRenderer.on('update-restart-query', function(_, query) {
      const flush =
        query && query.flush ? flushPendingSaves() : Promise.resolve()
      flush.then(() => {
        ipcRenderer.send('update-restart-reply', {
          id: query && query.id,
          dirty: hasPendingSave(),
          modalOpen: isModalOpen()
        })
      })
    })

    ipcRenderer.on('update-not-found', function(_, msg) {
      notify('Update not found!', {
        body: msg
      })
    })

    ipcRenderer.send('update-check', 'check-update')
    window.addEventListener('online', function() {
      if (!store.getState().status.updateReady) {
        ipcRenderer.send('update-check', 'check-update')
      }
    })
  }
)

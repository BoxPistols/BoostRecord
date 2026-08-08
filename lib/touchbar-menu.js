// macOS Touch Bar (Electron ネイティブ TouchBar API)。
//
// - 表示は「The Boosters のウィンドウがフォーカスされている時だけ」。
//   macOS は前面アプリのバーを出す仕様だが、main-app.js が focus/blur で
//   setTouchBar(bar/null) を明示的に切り替えて確実にする
// - Touch Bar 非搭載機・非 macOS では setTouchBar は無害な no-op
// - renderer への通知は webContents.send。renderer 側の eventEmitter は
//   実体が ipcRenderer なので ee.on(channel) で受かる（既存チャネルのみ使う）
// - 旧実装は new TouchBar([...]) の配列渡し（Electron 9 以前の API）で、
//   Electron 28 では items が undefined になり空バーになっていた。
//   現行 API は new TouchBar({ items })
// - 表示系トグル（一覧/情報/目次/モード/プレビュー）は横幅の制約から
//   TouchBarPopover のサブバーに収める
// - click ハンドラは actions として分離。実 Electron の TouchBarButton は
//   コンストラクタに渡した click を公開メソッドとして持たないため、
//   テスト・probe からは actions を直接叩く
const { TouchBar } = require('electron')
const { TouchBarButton, TouchBarSpacer, TouchBarPopover } = TouchBar
const mainWindow = require('./main-window')

function build() {
  const send = (...args) => mainWindow.webContents.send(...args)

  const actions = {
    // ナビゲーション（サイドバーの並びに対応）
    allNotes: () => send('list:navigate', '/home'),
    starredNotes: () => send('list:navigate', '/starred'),
    bookmarks: () => send('list:navigate', '/bookmarked'),
    tags: () => send('list:navigate', '/alltags'),
    // ノート操作
    find: () => send('detail:find'),
    noteLink: () => send('detail:focusnotelink'),
    newNote: () => {
      send('list:navigate', '/home')
      send('top:new-note')
    },
    // 表示切替（ホットキー設定と同じチャネル）
    toggleNoteList: () => send('sidenav:togglenotelist'),
    toggleInfo: () => send('detail:toggleinfo'),
    toggleToc: () => send('detail:toggletoc'),
    toggleMode: () => send('topbar:togglemodebutton'),
    togglePreview: () => send('topbar:togglepreviewbutton')
  }

  const buttons = {
    allNotes: new TouchBarButton({ label: '📒', click: actions.allNotes }),
    starredNotes: new TouchBarButton({
      label: '⭐️',
      click: actions.starredNotes
    }),
    bookmarks: new TouchBarButton({ label: '🔖', click: actions.bookmarks }),
    tags: new TouchBarButton({ label: '🏷', click: actions.tags }),
    find: new TouchBarButton({ label: '🔍', click: actions.find }),
    noteLink: new TouchBarButton({ label: '🔗', click: actions.noteLink }),
    newNote: new TouchBarButton({ label: '✎', click: actions.newNote }),
    toggleNoteList: new TouchBarButton({
      label: '一覧',
      click: actions.toggleNoteList
    }),
    toggleInfo: new TouchBarButton({
      label: '情報',
      click: actions.toggleInfo
    }),
    toggleToc: new TouchBarButton({ label: '目次', click: actions.toggleToc }),
    toggleMode: new TouchBarButton({
      label: 'モード',
      click: actions.toggleMode
    }),
    togglePreview: new TouchBarButton({
      label: 'プレビュー',
      click: actions.togglePreview
    })
  }

  const viewPopover = new TouchBarPopover({
    label: '👁 表示',
    showCloseButton: true,
    items: new TouchBar({
      items: [
        buttons.toggleNoteList,
        buttons.toggleInfo,
        buttons.toggleToc,
        buttons.toggleMode,
        buttons.togglePreview
      ]
    })
  })

  // 頻用の 🔍🔗👁表示 を左端に置く（ユーザー実機フィードバック）。
  // ゴミ箱は誤タップのリスクに対して使用頻度が低いので置かない
  const touchBar = new TouchBar({
    items: [
      buttons.find,
      buttons.noteLink,
      viewPopover,
      new TouchBarSpacer({ size: 'small' }),
      buttons.allNotes,
      buttons.starredNotes,
      buttons.bookmarks,
      buttons.tags,
      new TouchBarSpacer({ size: 'small' }),
      buttons.newNote
    ]
  })

  return { touchBar, buttons, actions, viewPopover }
}

module.exports = { build }

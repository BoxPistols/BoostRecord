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
// - build() で組み立てを関数化しているのはテスト・probe から
//   ボタンの click を直接叩けるようにするため
const { TouchBar } = require('electron')
const { TouchBarButton, TouchBarSpacer } = TouchBar
const mainWindow = require('./main-window')

function build() {
  // click ハンドラは TouchBarButton の外に持つ。実 Electron の
  // TouchBarButton はコンストラクタに渡した click を公開メソッドとして
  // 持たないため、テスト・probe からは actions を直接叩く
  const actions = {
    allNotes: () => {
      mainWindow.webContents.send('list:navigate', '/home')
    },
    starredNotes: () => {
      mainWindow.webContents.send('list:navigate', '/starred')
    },
    trash: () => {
      mainWindow.webContents.send('list:navigate', '/trashed')
    },
    find: () => {
      // ノート内検索 (Cmd+F 相当)。MarkdownNoteDetail が ipcRenderer.on で受ける
      mainWindow.webContents.send('detail:find')
    },
    newNote: () => {
      mainWindow.webContents.send('list:navigate', '/home')
      mainWindow.webContents.send('top:new-note')
    }
  }

  const buttons = {
    allNotes: new TouchBarButton({ label: '📒', click: actions.allNotes }),
    starredNotes: new TouchBarButton({
      label: '⭐️',
      click: actions.starredNotes
    }),
    trash: new TouchBarButton({ label: '🗑', click: actions.trash }),
    find: new TouchBarButton({ label: '🔍', click: actions.find }),
    newNote: new TouchBarButton({ label: '✎', click: actions.newNote })
  }

  const touchBar = new TouchBar({
    items: [
      buttons.allNotes,
      buttons.starredNotes,
      buttons.trash,
      new TouchBarSpacer({ size: 'small' }),
      buttons.find,
      new TouchBarSpacer({ size: 'small' }),
      buttons.newNote
    ]
  })

  return { touchBar, buttons, actions }
}

module.exports = { build }

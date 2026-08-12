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
//
// アイコンについて:
// - 単色グリフの PNG（resources/touchbar/）を template image として使う。
//   template image は alpha だけが使われ、配色は macOS が決めるので
//   ライト/ダークとアクセントカラーに自動追従する
// - 原盤は dev-scripts/touchbar-icons/*.svg。PNG は
//   `npm run build:touchbar-icons` で生成してコミットする
// - アイコンが読めない場合はテキストラベルへ退避する。無言で「押せるが
//   何も描かれていないボタン」にはしない
const { TouchBar, nativeImage } = require('electron')
const { TouchBarButton, TouchBarSpacer, TouchBarPopover } = TouchBar
const path = require('path')
const mainWindow = require('./main-window')

// asar: false なので packaged でも app/lib → app/resources で解決できる
// （main-window.js の resources/app.png と同じ解き方）
const ICON_DIR = path.join(__dirname, '..', 'resources', 'touchbar')

function loadIcon(name) {
  try {
    const img = nativeImage.createFromPath(path.join(ICON_DIR, name + '.png'))
    if (!img || img.isEmpty()) return null
    // alpha のみ使用 → 明暗テーマとアクセントカラーに追従する
    img.setTemplateImage(true)
    return img
  } catch (e) {
    return null
  }
}

// アイコン優先。読めなければラベルへ退避（accessibilityLabel は常に付ける）
function glyphButton(iconName, label, click) {
  const icon = loadIcon(iconName)
  const opts = icon
    ? { icon, accessibilityLabel: label, click }
    : { label, accessibilityLabel: label, click }
  return new TouchBarButton(opts)
}

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
    allNotes: glyphButton('all-notes', 'すべて', actions.allNotes),
    starredNotes: glyphButton('star', 'スター', actions.starredNotes),
    bookmarks: glyphButton('bookmark', 'ブックマーク', actions.bookmarks),
    tags: glyphButton('tag', 'タグ', actions.tags),
    find: glyphButton('search', '検索', actions.find),
    noteLink: glyphButton('link', 'リンク', actions.noteLink),
    newNote: glyphButton('new-note', '新規', actions.newNote),
    // ポップオーバー内は幅に余裕があり、意味の取り違えを避けたいのでテキスト
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

  const viewIcon = loadIcon('view')
  const viewPopover = new TouchBarPopover(
    Object.assign(
      { label: '表示', showCloseButton: true },
      viewIcon ? { icon: viewIcon } : {},
      {
        // プレビューを左端、目次を右端に（ユーザー実機フィードバック）
        items: new TouchBar({
          items: [
            buttons.togglePreview,
            buttons.toggleNoteList,
            buttons.toggleInfo,
            buttons.toggleMode,
            buttons.toggleToc
          ]
        })
      }
    )
  )

  // 頻用ボタンを左端に、中でも表示ポップオーバーを最左端に置く（ユーザー
  // 実機フィードバック）。ゴミ箱は誤タップのリスクに対して使用頻度が低いので
  // 置かない
  const touchBar = new TouchBar({
    items: [
      viewPopover,
      buttons.find,
      buttons.noteLink,
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

module.exports = { build, ICON_DIR }

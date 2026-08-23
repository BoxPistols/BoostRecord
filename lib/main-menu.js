const electron = require('electron')
const BrowserWindow = electron.BrowserWindow
const shell = electron.shell
const ipc = electron.ipcMain
const mainWindow = require('./main-window')
const os = require('os')

const macOS = process.platform === 'darwin'
// const WIN = process.platform === 'win32'
const LINUX = process.platform === 'linux'

const boost = macOS
  ? {
      label: 'BoostRecord',
      submenu: [
        {
          label: 'About BoostRecord',
          selector: 'orderFrontStandardAboutPanel:'
        },
        {
          type: 'separator'
        },
        {
          label: 'Preferences',
          accelerator: 'Command+,',
          click() {
            mainWindow.webContents.send('side:preferences')
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Hide BoostRecord',
          accelerator: 'Command+H',
          selector: 'hide:'
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          selector: 'hideOtherApplications:'
        },
        {
          label: 'Show All',
          selector: 'unhideAllApplications:'
        },
        {
          type: 'separator'
        },
        {
          label: 'Quit BoostRecord',
          role: 'quit',
          accelerator: 'CommandOrControl+Q'
        }
      ]
    }
  : {
      label: 'BoostRecord',
      submenu: [
        {
          label: 'Preferences',
          accelerator: 'Control+,',
          click() {
            mainWindow.webContents.send('side:preferences')
          }
        },
        {
          type: 'separator'
        },
        {
          role: 'quit',
          accelerator: 'Control+Q'
        }
      ]
    }

const file = {
  label: 'File',
  submenu: [
    {
      label: 'New Note',
      accelerator: 'CommandOrControl+N',
      click() {
        mainWindow.webContents.send('top:new-note')
      }
    },
    {
      // Cmd/Ctrl+E はホットキー設定の togglePreview(既定 Cmd+E)へ譲る。
      // ネイティブメニューのアクセラレータはレンダラーより先にキーを
      // 食うため、ここに置く限り設定画面のホットキーが一切効かない
      label: 'Focus Note',
      click() {
        mainWindow.webContents.send('detail:focus')
      }
    },
    {
      label: 'Delete Note',
      accelerator: 'CommandOrControl+Shift+Backspace',
      click() {
        mainWindow.webContents.send('detail:delete')
      }
    },
    {
      label: 'Clone Note',
      accelerator: 'CommandOrControl+D',
      click() {
        mainWindow.webContents.send('list:clone')
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Import from',
      submenu: [
        {
          label: 'Plain Text, MarkDown (.txt, .md)',
          click() {
            mainWindow.webContents.send('import:file')
          }
        }
      ]
    },
    {
      label: 'Export as',
      submenu: [
        {
          label: 'Plain Text (.txt)',
          click() {
            mainWindow.webContents.send('list:isMarkdownNote', 'export-txt')
            mainWindow.webContents.send('export:save-text')
          }
        },
        {
          label: 'MarkDown (.md)',
          click() {
            mainWindow.webContents.send('list:isMarkdownNote', 'export-md')
            mainWindow.webContents.send('export:save-md')
          }
        },
        {
          label: 'HTML (.html)',
          click() {
            mainWindow.webContents.send('list:isMarkdownNote', 'export-html')
            mainWindow.webContents.send('export:save-html')
          }
        },
        {
          label: 'PDF (.pdf)',
          click() {
            mainWindow.webContents.send('list:isMarkdownNote', 'export-pdf')
            mainWindow.webContents.send('export:save-pdf')
          }
        }
      ]
    },
    {
      type: 'separator'
    },
    {
      label: 'Generate/Update Markdown TOC',
      accelerator: 'Shift+Ctrl+T',
      click() {
        mainWindow.webContents.send('code:generate-toc')
      }
    },
    {
      label: 'Format Table',
      click() {
        mainWindow.webContents.send('code:format-table')
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Print',
      accelerator: 'CommandOrControl+P',
      click() {
        mainWindow.webContents.send('list:isMarkdownNote', 'print')
        mainWindow.webContents.send('print')
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Update',
      click() {
        mainWindow.webContents.send('update')
      }
    },
    {
      type: 'separator'
    }
  ]
}

if (LINUX) {
  file.submenu.push(
    {
      type: 'separator'
    },
    {
      label: 'Preferences',
      accelerator: 'Control+,',
      click() {
        mainWindow.webContents.send('side:preferences')
      }
    },
    {
      type: 'separator'
    },
    {
      role: 'quit',
      accelerator: 'Control+Q'
    }
  )
}

const edit = {
  label: 'Edit',
  submenu: [
    {
      label: 'Undo',
      accelerator: 'Command+Z',
      selector: 'undo:'
    },
    {
      label: 'Redo',
      accelerator: 'Shift+Command+Z',
      selector: 'redo:'
    },
    {
      type: 'separator'
    },
    {
      label: 'Cut',
      accelerator: 'Command+X',
      selector: 'cut:'
    },
    {
      label: 'Copy',
      accelerator: 'Command+C',
      selector: 'copy:'
    },
    {
      label: 'Paste',
      accelerator: 'Command+V',
      selector: 'paste:'
    },
    {
      label: 'Select All',
      accelerator: 'Command+A',
      selector: 'selectAll:'
    },
    {
      type: 'separator'
    },
    {
      label: 'Add Tag',
      accelerator: 'CommandOrControl+Shift+T',
      click() {
        mainWindow.webContents.send('editor:add-tag')
      }
    }
  ]
}

const view = {
  label: 'View',
  submenu: [
    {
      label: 'Reload',
      accelerator: 'CommandOrControl+R',
      click() {
        BrowserWindow.getFocusedWindow().reload()
      }
    },
    {
      label: 'Toggle Developer Tools',
      accelerator: 'CommandOrControl+Alt+I',
      click() {
        BrowserWindow.getFocusedWindow().toggleDevTools()
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Next Note',
      accelerator: 'CommandOrControl+]',
      click() {
        mainWindow.webContents.send('list:next')
      }
    },
    {
      label: 'Previous Note',
      accelerator: 'CommandOrControl+[',
      click() {
        mainWindow.webContents.send('list:prior')
      }
    },
    // スニペットのタブ移動。DOM の keydown だけで拾っていた時、実機で
    // Cmd+Shift+[ が SnippetNoteDetail まで届かなかった（window の capture には
    // 来るのに React のハンドラが呼ばれない）。ネイティブのアクセラレータとして
    // 登録すれば macOS が一意に解決するので、どこへ吸われるかを推測しなくて済む
    {
      label: 'Next Snippet Tab',
      accelerator: 'CommandOrControl+Shift+]',
      click() {
        mainWindow.webContents.send('snippet:next-tab')
      }
    },
    {
      label: 'Previous Snippet Tab',
      accelerator: 'CommandOrControl+Shift+[',
      click() {
        mainWindow.webContents.send('snippet:prev-tab')
      }
    },
    {
      type: 'separator'
    },
    {
      // accelerator は付けない。ホットキー設定の「エディタモードの切替」が
      // 同じキーを使うため、ネイティブ側が占有すると二重発火で打ち消し合う
      label: 'Focus Note List',
      click() {
        mainWindow.webContents.send('list:focus')
      }
    },
    {
      // accelerator は付けない（ホットキー設定の「表示／非表示」と同じキー）
      label: 'Focus Search',
      click() {
        mainWindow.webContents.send('top:focus-search')
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Toggle Full Screen',
      accelerator: macOS ? 'Command+Control+F' : 'F11',
      click() {
        mainWindow.setFullScreen(!mainWindow.isFullScreen())
      }
    },
    {
      label: 'Toggle Side Bar',
      accelerator: 'CommandOrControl+B',
      click() {
        mainWindow.webContents.send('sidenav:togglesidenav')
      }
    },
    {
      // accelerator は付けない。ホットキー設定（config.hotkey.toggleNoteList）
      // から mousetrap で束ねており、ネイティブ accelerator がキーを占有すると
      // 二重に発火して開閉が打ち消し合う
      label: 'Toggle Note List',
      click() {
        mainWindow.webContents.send('sidenav:togglenotelist')
      }
    },
    {
      label: 'Previous Folder',
      accelerator: 'Alt+Up',
      click() {
        mainWindow.webContents.send('folder:prior')
      }
    },
    {
      label: 'Next Folder',
      accelerator: 'Alt+Down',
      click() {
        mainWindow.webContents.send('folder:next')
      }
    },
    {
      label: 'Toggle Editor Orientation',
      click() {
        mainWindow.webContents.send('editor:orientation')
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Actual Size',
      accelerator: 'CommandOrControl+0',
      click() {
        mainWindow.webContents.send('status:zoomreset')
      }
    },
    {
      label: 'Zoom In',
      accelerator: 'CommandOrControl+=',
      click() {
        mainWindow.webContents.send('status:zoomin')
      }
    },
    {
      label: 'Zoom Out',
      accelerator: 'CommandOrControl+-',
      click() {
        mainWindow.webContents.send('status:zoomout')
      }
    }
  ]
}

let editorFocused

// Define extra shortcut keys
mainWindow.webContents.on('before-input-event', (event, input) => {
  // Synonyms for Search (Find)
  if (input.control && input.key === 'l' && input.type === 'keyDown') {
    if (!editorFocused) {
      mainWindow.webContents.send('top:focus-search')
      event.preventDefault()
    }
  }

  // ノート内検索 (Cmd/Ctrl+F)。**accelerator ではなくここで取る。**
  // 理由が2つある:
  //   1. 実測で、プレビュー(iframe)にフォーカスがあると Cmd+F は iframe へ
  //      吸われ、renderer の capture リスナーにすら届かない
  //      (keySeenInRenderer: 0)。しかもクリックしていなくても
  //      activeElement は IFRAME なので、**普通に使うと効かない方が既定**
  //   2. accelerator は sendInputEvent で検証できない。実測で accel=0 /
  //      before-input-event=1 になる。probe が緑でも赤でも判定材料にならず、
  //      このプロジェクトが4回連続で誤報告した型と同じ事故になる
  // Shift を除外しないと Cmd/Ctrl+Shift+F（ホットキー設定の
  // prettifyMarkdown 既定値）まで検索が横取りして preventDefault で
  // 握り潰す。素の Cmd/Ctrl+F だけを検索にする
  if (
    input.key &&
    input.key.toLowerCase() === 'f' &&
    (input.meta || input.control) &&
    !input.alt &&
    !input.shift &&
    input.type === 'keyDown'
  ) {
    mainWindow.webContents.send('detail:find')
    event.preventDefault()
  }

  // ペイン間フォーカス移動 (#122)。実機では裸の Tab の keydown が
  // レンダラーの capture リスナーにすら届かない環境があるため、DOM 層より
  // 手前のここで捕まえて IPC で渡す。preventDefault はしない(入力欄での
  // Tab 本来の動作を壊さないため)。行き先の判断はフォーカス位置を知っている
  // レンダラー側 (Main.js handlePaneTab) が行い、同じ押下を DOM 経路も
  // 観測した場合はレンダラー側の待ち合わせで IPC が譲る
  if (
    input.type === 'keyDown' &&
    input.key === 'Tab' &&
    !input.control &&
    !input.meta &&
    !input.alt &&
    !input.isAutoRepeat
  ) {
    mainWindow.webContents.send('pane:tab', { shift: input.shift })
  }
})

ipc.on('editor:focused', (event, isFocused) => {
  editorFocused = isFocused
})

const window = {
  label: 'Window',
  submenu: [
    {
      label: 'Minimize',
      accelerator: 'Command+M',
      selector: 'performMiniaturize:'
    },
    {
      label: 'Close',
      accelerator: 'Command+W',
      selector: 'performClose:'
    },
    {
      type: 'separator'
    },
    {
      label: 'Bring All to Front',
      selector: 'arrangeInFront:'
    }
  ]
}

const help = {
  label: 'Help',
  role: 'help',
  submenu: [
    {
      label: 'BoostRecord site',
      click() {
        shell.openExternal('https://github.com/BoxPistols/BoostRecord')
      }
    },
    {
      label: 'Wiki',
      click() {
        shell.openExternal('https://github.com/BoxPistols/BoostRecord/wiki')
      }
    },
    {
      label: 'Issue Tracker',
      click() {
        shell.openExternal('https://github.com/BoxPistols/BoostRecord/issues')
      }
    },
    {
      label: 'Changelog',
      click() {
        shell.openExternal('https://github.com/BoxPistols/BoostRecord/releases')
      }
    },
    {
      label: 'Cheatsheets',
      submenu: [
        {
          label: 'Markdown',
          click() {
            shell.openExternal(
              'https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet'
            )
          }
        },
        {
          label: 'Latex',
          click() {
            shell.openExternal('https://katex.org/docs/supported.html')
          }
        },
        {
          label: 'HTML',
          click() {
            shell.openExternal('https://htmlcheatsheet.com/')
          }
        },
        {
          label: 'Markdown',
          click() {
            shell.openExternal('https://www.markdownguide.org/cheat-sheet/')
          }
        }
      ]
    },
    {
      type: 'separator'
    },
    {
      label: 'About',
      click() {
        const version = electron.app.getVersion()
        const electronVersion = process.versions.electron
        const chromeVersion = process.versions.chrome
        const nodeVersion = process.versions.node
        const v8Version = process.versions.v8
        const OSInfo = `${os.type()} ${os.arch()} ${os.release()}`
        const detail = `Version: ${version}\nElectron: ${electronVersion}\nChrome: ${chromeVersion}\nNode.js: ${nodeVersion}\nV8: ${v8Version}\nOS: ${OSInfo}`
        electron.dialog.showMessageBoxSync(BrowserWindow.getFocusedWindow(), {
          title: 'BoostRecord',
          message: 'BoostRecord',
          type: 'info',
          detail: `\n${detail}`
        })
      }
    }
  ]
}

module.exports =
  process.platform === 'darwin'
    ? [boost, file, edit, view, window, help]
    : process.platform === 'win32'
    ? [boost, file, view, help]
    : [file, view, help]

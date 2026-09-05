import ee from 'browser/main/lib/eventEmitter'

export default {
  toggleMode: () => {
    ee.emit('topbar:togglemodebutton')
  },
  togglePreview: () => {
    ee.emit('topbar:togglepreviewbutton')
  },
  toggleDirection: () => {
    ee.emit('topbar:toggledirectionbutton')
  },
  deleteNote: () => {
    ee.emit('hotkey:deletenote')
  },
  toggleMenuBar: () => {
    ee.emit('menubar:togglemenubar')
  },
  toggleNoteList: () => {
    ee.emit('sidenav:togglenotelist')
  },
  toggleInfo: () => {
    ee.emit('detail:toggleinfo')
  },
  focusNoteLink: () => {
    ee.emit('detail:focusnotelink')
  },
  toggleToc: () => {
    ee.emit('detail:toggletoc')
  },
  // 音声プレーヤー。バーが閉じていれば開いてから再生する
  playerToggle: () => {
    ee.emit('player:toggle')
  },
  playerStop: () => {
    ee.emit('player:stop')
  },
  playerPrev: () => {
    ee.emit('player:prev')
  },
  playerNext: () => {
    ee.emit('player:next')
  },
  playerVolumeUp: () => {
    ee.emit('player:volume', 1)
  },
  playerVolumeDown: () => {
    ee.emit('player:volume', -1)
  },
  playerSpeedUp: () => {
    ee.emit('player:speed', 1)
  },
  playerSpeedDown: () => {
    ee.emit('player:speed', -1)
  }
}

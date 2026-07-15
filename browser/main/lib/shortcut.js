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
  toggleFullscreen: () => {
    ee.emit('editor:fullscreen')
  }
}

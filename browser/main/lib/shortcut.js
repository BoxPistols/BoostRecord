import ee from 'browser/main/lib/eventEmitter'

export default {
  toggleMode: () => {
    ee.emit('topbar:togglemodebutton')
  },
  toggleDirection: () => {
    ee.emit('topbar:toggledirectionbutton')
  },
  deleteNote: () => {
    ee.emit('hotkey:deletenote')
  },
  toggleMenuBar: () => {
    ee.emit('menubar:togglemenubar')
  }
}

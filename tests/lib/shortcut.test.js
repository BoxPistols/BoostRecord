import ee from 'browser/main/lib/eventEmitter'
import shortcut from 'browser/main/lib/shortcut'

const cases = [
  ['toggleMode', 'topbar:togglemodebutton'],
  ['toggleDirection', 'topbar:toggledirectionbutton'],
  ['deleteNote', 'hotkey:deletenote'],
  ['toggleMenuBar', 'menubar:togglemenubar']
]

cases.forEach(([fn, event]) => {
  it(`${fn} emits "${event}"`, () => {
    const spy = jest.spyOn(ee, 'emit').mockImplementation(() => {})
    shortcut[fn]()
    expect(spy).toHaveBeenCalledWith(event)
    spy.mockRestore()
  })
})

// eventEmitter wraps Electron ipcRenderer/remote, which don't exist under jest,
// so mock it and assert the shortcut fires the expected event name.
jest.mock('../../browser/main/lib/eventEmitter', () => {
  const ee = { emit: jest.fn(), on: jest.fn(), off: jest.fn(), once: jest.fn() }
  return { __esModule: true, default: ee }
})

import ee from 'browser/main/lib/eventEmitter'
import shortcut from 'browser/main/lib/shortcut'

describe('togglePreview shortcut', () => {
  beforeEach(() => ee.emit.mockClear())

  it('is registered in the shortcut map', () => {
    expect(typeof shortcut.togglePreview).toBe('function')
  })

  it('emits topbar:togglepreviewbutton when invoked', () => {
    shortcut.togglePreview()
    expect(ee.emit).toHaveBeenCalledWith('topbar:togglepreviewbutton')
  })
})

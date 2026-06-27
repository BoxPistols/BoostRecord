import {
  createConfigReducer,
  status,
  defaultStatus
} from 'browser/main/configReducer'

describe('config reducer', () => {
  const config = createConfigReducer({ zoom: 1, isSideNavFolded: false })

  it('returns the injected default state initially', () => {
    expect(config(undefined, { type: '@@INIT' })).toEqual({
      zoom: 1,
      isSideNavFolded: false
    })
  })

  it('SET_ZOOM updates the zoom', () => {
    expect(config({ zoom: 1 }, { type: 'SET_ZOOM', zoom: 2 }).zoom).toBe(2)
  })

  it('SET_IS_SIDENAV_FOLDED updates the fold flag', () => {
    const result = config(
      { isSideNavFolded: false },
      { type: 'SET_IS_SIDENAV_FOLDED', isFolded: true }
    )
    expect(result.isSideNavFolded).toBe(true)
  })

  it('SET_CONFIG merges the provided config', () => {
    expect(config({ a: 1 }, { type: 'SET_CONFIG', config: { b: 2 } })).toEqual({
      a: 1,
      b: 2
    })
  })

  it('SET_UI merges the provided config', () => {
    expect(
      config({ a: 1 }, { type: 'SET_UI', config: { theme: 'dark' } }).theme
    ).toBe('dark')
  })

  it('returns the same state for an unknown action', () => {
    const state = { zoom: 1 }
    expect(config(state, { type: 'NOPE' })).toBe(state)
  })
})

describe('status reducer', () => {
  it('defaults to not-ready', () => {
    expect(status(undefined, { type: '@@INIT' })).toEqual({
      updateReady: false
    })
  })

  it('UPDATE_AVAILABLE marks the update ready', () => {
    expect(status(defaultStatus, { type: 'UPDATE_AVAILABLE' })).toEqual({
      updateReady: true
    })
  })

  it('returns the same state for an unknown action', () => {
    const state = { updateReady: false }
    expect(status(state, { type: 'NOPE' })).toBe(state)
  })
})

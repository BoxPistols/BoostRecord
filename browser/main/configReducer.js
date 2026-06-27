// The config reducer's initial state comes from ConfigManager (which needs
// electron), so it is built as a factory that receives the default config.
// This keeps the reducer logic free of electron and unit-testable.
export function createConfigReducer(defaultConfig) {
  return function config(state = defaultConfig, action) {
    switch (action.type) {
      case 'SET_IS_SIDENAV_FOLDED':
        state.isSideNavFolded = action.isFolded
        return Object.assign({}, state)
      case 'SET_ZOOM':
        state.zoom = action.zoom
        return Object.assign({}, state)
      case 'SET_LIST_WIDTH':
        state.listWidth = action.listWidth
        return Object.assign({}, state)
      case 'SET_NAV_WIDTH':
        state.navWidth = action.navWidth
        return Object.assign({}, state)
      case 'SET_CONFIG':
        return Object.assign({}, state, action.config)
      case 'SET_UI':
        return Object.assign({}, state, action.config)
    }
    return state
  }
}

export const defaultStatus = {
  updateReady: false
}

export function status(state = defaultStatus, action) {
  switch (action.type) {
    case 'UPDATE_AVAILABLE':
      return Object.assign({}, defaultStatus, {
        updateReady: true
      })
  }
  return state
}

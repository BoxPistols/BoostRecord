import { combineReducers, createStore, compose, applyMiddleware } from 'redux'
import { connectRouter, routerMiddleware } from 'connected-react-router'
import { createHashHistory as createHistory } from 'history'
import ConfigManager from 'browser/main/lib/ConfigManager'
import DevTools from './DevTools'
import { data } from './dataReducer'

const defaultConfig = ConfigManager.get()

function config(state = defaultConfig, action) {
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

const defaultStatus = {
  updateReady: false
}

function status(state = defaultStatus, action) {
  switch (action.type) {
    case 'UPDATE_AVAILABLE':
      return Object.assign({}, defaultStatus, {
        updateReady: true
      })
  }
  return state
}

const history = createHistory()

const reducer = combineReducers({
  data,
  config,
  status,
  router: connectRouter(history)
})

const store = createStore(
  reducer,
  undefined,
  process.env.NODE_ENV === 'development'
    ? compose(applyMiddleware(routerMiddleware(history)), DevTools.instrument())
    : applyMiddleware(routerMiddleware(history))
)

export { store, history }

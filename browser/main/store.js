import { combineReducers, createStore, compose, applyMiddleware } from 'redux'
import { connectRouter, routerMiddleware } from 'connected-react-router'
import { createHashHistory as createHistory } from 'history'
import ConfigManager from 'browser/main/lib/ConfigManager'
import DevTools from './DevTools'
import { data } from './dataReducer'
import { createConfigReducer, status } from './configReducer'

const config = createConfigReducer(ConfigManager.get())

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

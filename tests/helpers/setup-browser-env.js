import browserEnv from 'browser-env'
browserEnv(['window', 'document'])

window.localStorage = {
  // polyfill
  getItem () {
    return '{}'
  }
}

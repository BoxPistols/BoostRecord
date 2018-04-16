const path = require('path')
const { remote } = require('electron')
const { app } = remote

// load package for localization
const i18n = new (require('i18n-2'))({
  // setup some locales - other locales default to the first locale
  locales: [ 'da', 'de', 'en', 'es-ES', 'fr', 'hu', 'ja', 'ko', 'pl', 'pt-BR', 'pt-PT', 'ru', 'sq', 'zh-CN', 'zh-TW' ],
  extension: '.json',
  directory: process.env.NODE_ENV === 'production'
    ? path.join(app.getAppPath(), './locales')
    : path.resolve('./locales'),
  devMode: false
})

export default i18n

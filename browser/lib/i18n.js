const path = require('path')
const { remote } = require('electron')
const { app } = remote
const { languages } = require('./Languages.js')

let locales = languages.reduce(function (localeList, locale) {
  localeList.push(locale.locale)
  return localeList
}, [])

// load package for localization
const i18n = new (require('i18n-2'))({
  // setup some locales - other locales default to the first locale
  locales: locales,
  extension: '.json',
  directory: process.env.NODE_ENV === 'production'
    ? path.join(app.getAppPath(), './locales')
    : path.resolve('./locales'),
  devMode: false
})

export default i18n

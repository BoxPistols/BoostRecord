// load package for localization
const i18n = new (require('i18n-2'))({
  // setup some locales - other locales default to the first locale
  locales: ['en', 'de', 'fr'],
  extension: '.json'
})

export default i18n

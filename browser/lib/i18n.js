// load package for localization
const i18n = new (require('i18n-2'))({
  // setup some locales - other locales default to the first locale
  locales: ['en', 'sq', 'zh-CN', 'zh-TW', 'da', 'fr', 'de', 'hu', 'ja', 'ko', 'no', 'pl', 'pt', 'es-ES'],
  extension: '.json',
  devMode: false
})

export default i18n

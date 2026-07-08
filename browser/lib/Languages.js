const languages = [
  {
    name: 'English',
    locale: 'en'
  },
  {
    name: 'Japanese',
    locale: 'ja'
  }
]

module.exports = {
  getLocales() {
    return languages.reduce(function(localeList, locale) {
      localeList.push(locale.locale)
      return localeList
    }, [])
  },
  getLanguages() {
    return languages
  }
}

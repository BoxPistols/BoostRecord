// 対応言語はこの配列が単一の出どころ。getLocales() の戻りがそのまま i18n-2 の
// `locales` に渡るため、ここに無い言語の locales/*.json は読み込まれない。
//
// upstream の Boostnote から 19 言語ぶんのファイルを引き継いでいたが、この配列に
// 載っていないため一度も読まれず、環境設定の言語欄にも出てこなかった。訳を
// 検証できる人がいない言語を機械翻訳で埋めても間違いに気づけないまま残るので、
// 対応は日本語と英語に絞り、死んでいたファイルは削除した（#141）。
//
// 言語を足すときは locales/<locale>.json を用意してからこの配列に足す。
// 順序が逆だと i18n-2 が読めないファイルを探して落ちる。
// tests/lib/i18nCoverage.test.js がこの対応関係を検査する。
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

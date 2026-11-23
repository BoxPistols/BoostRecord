// テスト時にbabel-plugin-webpack-aliasが読むエイリアス設定。
// webpackのビルドは廃止したので、webpack本体を読み込まずに解決規則だけを置く。
// 値は旧webpack-skeleton.jsのresolveと同じにしておく（テストのimport解決が変わらないように）
const path = require('path')

module.exports = {
  resolve: {
    extensions: ['', '.js', '.jsx', '.styl'],
    alias: {
      lib: path.join(__dirname, 'lib'),
      browser: path.join(__dirname, 'browser')
    }
  }
}

const { base, rules } = require('./webpack-skeleton')
const path = require('path')

module.exports = Object.assign({}, base, {
  mode: 'development',
  module: { rules },
  output: {
    path: path.join(__dirname, 'compiled'),
    filename: '[name].js',
    sourceMapFilename: '[name].map',
    libraryTarget: 'commonjs2',
    publicPath: 'http://localhost:8080/assets/'
  },
  devtool: 'eval-cheap-module-source-map',
  devServer: {
    port: 8080,
    hot: true
  }
})

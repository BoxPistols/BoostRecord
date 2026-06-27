const { base, rules } = require('./webpack-skeleton')
const webpack = require('webpack')
const path = require('path')

module.exports = Object.assign({}, base, {
  mode: 'production',
  module: { rules },
  output: {
    path: path.join(__dirname, 'compiled'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    sourceMapFilename: '[name].map',
    publicPath: 'http://localhost:8080/assets/'
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env.BABEL_ENV': JSON.stringify('production')
    })
  ]
})

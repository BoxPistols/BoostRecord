const path = require('path')

// Base config shared by the dev and production webpack configs.
const base = {
  entry: {
    main: ['./browser/main/index.js']
  },
  // Electron renderer process: gives access to Node built-ins and the DOM,
  // replacing the old NodeTargetPlugin.
  target: 'electron-renderer',
  resolve: {
    extensions: ['.js', '.jsx', '.styl', '.json'],
    // webpack 1 packageMains -> mainFields/aliasFields
    mainFields: ['browser', 'main'],
    aliasFields: ['browser'],
    alias: {
      lib: path.join(__dirname, 'lib'),
      browser: path.join(__dirname, 'browser')
    }
  },
  externals: [
    'prettier',
    'node-ipc',
    'electron',
    'lodash',
    'markdown-it',
    'moment',
    'markdown-it-emoji',
    'fs-jetpack',
    '@rokt33r/markdown-it-math',
    'markdown-it-kbd',
    'markdown-it-plantuml',
    'markdown-it-admonition',
    'markdown-toc',
    'devtron',
    '@rokt33r/season',
    {
      react: 'var React',
      'react-dom': 'var ReactDOM',
      'react-redux': 'var ReactRedux',
      codemirror: 'var CodeMirror',
      redux: 'var Redux',
      raphael: 'var Raphael',
      flowchart: 'var flowchart',
      'sequence-diagram': 'var Diagram'
    }
  ]
}

// Shared stylus-loader config (nib + auto-imported variables). Inline
// `!!...` requires can't carry these options, so global/raw stylesheets go
// through resourceQuery rules below instead.
const stylusLoader = {
  loader: 'stylus-loader',
  options: {
    sourceMap: true,
    stylusOptions: {
      use: [require('nib')()],
      import: [
        '~nib/lib/nib/index.styl',
        path.join(__dirname, 'browser/styles/index.styl')
      ]
    }
  }
}

// Shared loader rules (webpack 1 `module.loaders` -> webpack 5 `module.rules`).
const rules = [
  {
    test: /\.jsx?$/,
    exclude: /(node_modules|bower_components)/,
    use: {
      loader: 'babel-loader',
      options: { cacheDirectory: true }
    }
  },
  // Component stylesheets -> CSS modules (scoped class names).
  {
    test: /\.styl$/,
    resourceQuery: { not: [/raw/, /global/] },
    exclude: /(node_modules|bower_components)/,
    use: [
      'style-loader',
      {
        loader: 'css-loader',
        options: {
          importLoaders: 1,
          modules: { localIdentName: '[name]__[local]___[path]' }
        }
      },
      stylusLoader
    ]
  },
  // `import './x.styl?global'` -> injected unscoped (global stylesheet).
  {
    test: /\.styl$/,
    resourceQuery: /global/,
    use: [
      'style-loader',
      { loader: 'css-loader', options: { importLoaders: 1 } },
      stylusLoader
    ]
  },
  // `import css from './x.styl?raw'` -> the compiled CSS as a string
  // (used to embed markdown styles into exported HTML).
  {
    test: /\.styl$/,
    resourceQuery: /raw/,
    use: [
      {
        loader: 'css-loader',
        options: { importLoaders: 1, exportType: 'string' }
      },
      stylusLoader
    ]
  }
]

module.exports = { base, rules }

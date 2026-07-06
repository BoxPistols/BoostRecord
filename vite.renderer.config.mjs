// Vite build for the legacy renderer — replaces webpack 1 (S2a of the
// modernization: same artifact contract, new toolchain).
//
// Contract kept identical to the webpack build so the Electron side is
// untouched:
//   - emits compiled/main.js (single CJS chunk) loaded by lib/main.*.html
//   - emits compiled/main.css, <link>ed from the same HTML files
//   - every bare import stays EXTERNAL and is require()d at runtime
//     (nodeIntegration renderer + asar:false ships real node_modules), so
//     rollup never has to bundle legacy CJS deps — that's where webpack1→5
//     migrations die. ESM-only upgrades will later opt back INTO bundling
//     per-package by removing them from the external fn.
//   - CodeMirror / Raphael / flowchart resolve to window globals (mode/addon
//     <script> tags register on that instance) via browser/lib/vendorGlobals.
import { defineConfig } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const nib = require('nib')
// fileURLToPath handles Windows (file:///D:/... → D:\...) correctly;
// new URL().pathname alone produces /D:/... which breaks path.join on Windows.
const root = path.dirname(fileURLToPath(import.meta.url))

// Legacy components import './Foo.styl' and expect CSS modules (react-css-modules
// runtime HOC). Vite only treats *.module.styl as modules, so rewrite the resolved
// id to a virtual "<file>.module.styl" and feed the real file from load().
// global.styl (app-wide styles) and ?inline/?raw queries are left untouched.
function legacyStylusCssModules() {
  return {
    name: 'legacy-styl-css-modules',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.endsWith('.styl') || source.includes('?')) return null
      // Guard: never re-process our own virtual ids (X.module.styl would
      // otherwise grow to X.module.module.styl… in an endless resolve loop).
      if (source.endsWith('.module.styl')) return null
      const resolved = await this.resolve(source, importer, {
        skipSelf: true,
        ...options
      })
      if (!resolved) return null
      const id = resolved.id
      if (!id.includes(`${path.sep}browser${path.sep}`)) return null
      if (id.endsWith('global.styl')) return null
      return id.replace(/\.styl$/, '.module.styl')
    },
    load(id) {
      if (!id.endsWith('.module.styl')) return null
      const real = id.replace(/\.module\.styl$/, '.styl')
      if (fs.existsSync(real) && !fs.existsSync(id)) {
        return fs.readFileSync(real, 'utf8')
      }
      return null
    }
  }
}

// Bare imports (anything not relative/absolute/aliased) resolve at runtime via
// Node require from the shipped node_modules. `browser/...` / `lib/...` are our
// source aliases, and the vendorGlobals shims must be bundled.
const SOURCE_PREFIX = /^(browser|lib)\//
const BUNDLED = new Set([
  'codemirror',
  'raphael',
  'flowchart',
  // aliased to shims (rollup consults `external` before alias resolution,
  // so these must be excluded from the external list to reach their alias)
  'mousetrap-global-bind',
  'codemirror-mode-elixir',
  // Babel-built CJS ({ __esModule, default }): default-importing these as
  // runtime externals breaks (rollup emits no interop for cjs output), so
  // bundle them — plugin-commonjs resolves __esModule correctly.
  '@hikerpig/markdown-it-toc-and-anchor',
  '@susisu/mte-kernel',
  'connected-react-router',
  'lodash-move',
  'react-color',
  'react-composition-input',
  'react-debounce-render',
  'react-emoji-render',
  'react-image-carousel',
  'react-redux',
  'react-sortable-hoc',
  'redux',
  'turndown-plugin-gfm'
])

// require() of these at runtime throws ERR_REQUIRE_ESM — bundle instead.
// (The 2026-07 dep wave upgraded the bottom four to their ESM-only majors.)
const ESM_ONLY_PREFIX = [
  '@babel/runtime/',
  'lodash-es',
  'escape-string-regexp',
  'file-url',
  'filenamify',
  'query-string',
  // transitive ESM-only deps of the four above
  'filename-reserved-regex',
  'strip-outer',
  'trim-repeated',
  'split-on-first',
  'filter-obj',
  'decode-uri-component'
]

// Same auto-imports the webpack stylus block provided (prepended to every
// .styl source — the `imports` option isn't applied by Vite, so inject).
// Stylus @import paths must use forward slashes — Windows backslashes contain
// \n, \t etc. which Stylus interprets as escape sequences and breaks the path.
const toSlash = p => p.replace(/\\/g, '/')
const stylusOptions = {
  use: [nib()],
  additionalData:
    `@import '${toSlash(require.resolve('nib/lib/nib/index.styl'))}'\n` +
    `@import '${toSlash(path.join(root, 'browser/styles/index.styl'))}'\n`
}

export default defineConfig({
  base: './',
  plugins: [legacyStylusCssModules()],
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.styl'],
    // webpack packageMains had 'browser' before 'main'
    mainFields: ['browser', 'module', 'main'],
    alias: [
      { find: /^browser\//, replacement: `${root}/browser/` },
      { find: /^lib\//, replacement: `${root}/lib/` },
      {
        find: /^codemirror$/,
        replacement: `${root}/browser/lib/vendorGlobals/codemirror.js`
      },
      {
        find: /^raphael$/,
        replacement: `${root}/browser/lib/vendorGlobals/raphael.js`
      },
      {
        find: /^flowchart$/,
        replacement: `${root}/browser/lib/vendorGlobals/flowchart.js`
      },
      {
        // order-pinning shim (see the file's comment)
        find: /^mousetrap-global-bind$/,
        replacement: `${root}/browser/lib/vendorGlobals/mousetrapGlobalBind.js`
      },
      // NOTE: codemirror-mode-elixir is intentionally NOT aliased — it stays
      // in BUNDLED, so plugin-commonjs bundles its UMD and the inner
      // require('codemirror') hits the window-global alias above, registering
      // the elixir mode on the right CodeMirror instance. (Its old <script>
      // tag mis-detected CJS on Electron 28 pages and crashed — removed.)
    ]
  },
  // Legacy JSX lives in plain .js files (esbuild assumes JSX only in .jsx).
  // Every file imports React itself, so the classic createElement transform
  // works. NOTE: this needs Vite 6 (rollup+esbuild) — Vite 8 (rolldown)
  // ignores `esbuild`, rejects a `jsx` rollupOption, and hangs on this
  // codebase's mixed CJS/ESM sources.
  esbuild: {
    loader: 'jsx',
    include: /(browser|lib)\/.*\.jsx?$/,
    exclude: [/node_modules/]
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.BABEL_ENV': JSON.stringify('production'),
    // Vite's browser defaults statically replace `process.env` /
    // `global.process.env` with `{}` — but this renderer has nodeIntegration
    // and a real `process` (RcParser reads HOME/USERPROFILE at runtime).
    // Map them back to live lookups.
    'global.process.env': 'process.env',
    'process.env': 'process.env'
  },
  css: {
    preprocessorOptions: {
      // Vite keys stylus options by file extension: `.styl` files read the
      // `styl` key (the `stylus` key is kept as a safety net for `.stylus`).
      styl: stylusOptions,
      stylus: stylusOptions
    }
  },
  build: {
    outDir: 'compiled',
    emptyOutDir: true,
    sourcemap: true,
    // Electron 28 = Chromium 120
    target: 'chrome120',
    cssCodeSplit: false,
    commonjsOptions: {
      // legacy source mixes `import` with `require`/`module.exports`
      transformMixedEsModules: true,
      include: [/node_modules/, /browser\//, /lib\//],
      extensions: ['.js', '.jsx']
    },
    rollupOptions: {
      input: path.join(root, 'browser/main/index.js'),
      external(source) {
        if (source.startsWith('.') || source.startsWith('/')) return false
        if (path.isAbsolute(source)) return false // Windows: C:\... paths are never external
        if (SOURCE_PREFIX.test(source)) return false
        if (BUNDLED.has(source)) return false
        // ESM-only packages (and ESM helper subpaths of bundled deps) cannot
        // be require()d at runtime — always bundle them.
        if (ESM_ONLY_PREFIX.some(p => source.startsWith(p))) return false
        return true
      },
      output: {
        format: 'cjs',
        // The bundle is loaded as a classic <script>, so top-level const/let
        // would collide with window properties (e.g. `top`). Wrap in an IIFE;
        // `require` is still a global in the nodeIntegration renderer.
        banner: ';(function () {',
        footer: '})();',
        entryFileNames: 'main.js',
        inlineDynamicImports: true,
        assetFileNames(assetInfo) {
          const name = assetInfo.names ? assetInfo.names[0] : assetInfo.name
          if (name && name.endsWith('.css')) return 'main.css'
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  }
})

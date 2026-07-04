// mousetrap-global-bind reads the window.Mousetrap global that mousetrap's UMD
// sets as a side effect. Rollup hoists external require()s to the top of the
// chunk in graph order, which can run the plugin before mousetrap itself — so
// pin the order here: mousetrap first, then the plugin file.
require('mousetrap')
require('mousetrap-global-bind/mousetrap-global-bind.js')

/**
 * @fileoverview Markdown table of contents generator
 */

import toc from 'markdown-toc'
import diacritics from 'diacritics-map'
import stripColor from 'strip-color'

/**
 * @caseSensitiveSlugify Custom slugify function
 * Same implementation that the original used by markdown-toc (node_modules/markdown-toc/lib/utils.js),
 * but keeps original case to properly handle https://github.com/BoostIO/Boostnote/issues/2067
 */
function caseSensitiveSlugify (str) {
  function replaceDiacritics (str) {
    return str.replace(/[À-ž]/g, function (ch) {
      return diacritics[ch] || ch
    })
  }
  function getTitle (str) {
    if (/^\[[^\]]+\]\(/.test(str)) {
      var m = /^\[([^\]]+)\]/.exec(str)
      if (m) return m[1]
    }
    return str
  }
  str = getTitle(str)
  str = stripColor(str)
  // str = str.toLowerCase() //let's be case sensitive

  // `.split()` is often (but not always) faster than `.replace()`
  str = str.split(' ').join('-')
  str = str.split(/\t/).join('--')
  str = str.split(/<\/?[^>]+>/).join('')
  str = str.split(/[|$&`~=\\\/@+*!?({[\]})<>=.,;:'"^]/).join('')
  str = str.split(/[。？！，、；：“”【】（）〔〕［］﹃﹄“ ”‘’﹁﹂—…－～《》〈〉「」]/).join('')
  str = replaceDiacritics(str)
  return str
}

export function generate (currentValue, updateCallback) {
  const TOC_MARKER = '<!-- toc -->'
  if (!currentValue.includes(TOC_MARKER)) {
    currentValue = TOC_MARKER + currentValue
  }
  updateCallback(toc.insert(currentValue, {slugify: caseSensitiveSlugify}))
}

export default {
  generate
}


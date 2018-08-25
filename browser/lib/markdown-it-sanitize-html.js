'use strict'

import sanitizeHtml from 'sanitize-html'
import { escapeHtmlCharacters } from './utils'
import url from 'url'

module.exports = function sanitizePlugin (md, options) {
  options = options || {}

  md.core.ruler.after('linkify', 'sanitize_inline', state => {
    for (let tokenIdx = 0; tokenIdx < state.tokens.length; tokenIdx++) {
      if (state.tokens[tokenIdx].type === 'html_block') {
        state.tokens[tokenIdx].content = sanitizeHtml(
          state.tokens[tokenIdx].content,
          options
        )
      }
      if (state.tokens[tokenIdx].type === 'fence') {
        // escapeHtmlCharacters has better performance
        state.tokens[tokenIdx].content = escapeHtmlCharacters(
          state.tokens[tokenIdx].content,
          { skipSingleQuote: true }
        )
      }
      if (state.tokens[tokenIdx].type === 'inline') {
        const inlineTokens = state.tokens[tokenIdx].children
        for (let childIdx = 0; childIdx < inlineTokens.length; childIdx++) {
          if (inlineTokens[childIdx].type === 'html_inline') {
            inlineTokens[childIdx].content = sanitizeInline(
              inlineTokens[childIdx].content,
              options
            )
          }
        }
      }
    }
  })
}

const tag_regex = /<([A-Z][A-Z0-9]*)\s*((?:\s*[A-Z][A-Z0-9]*(?:="(?:[^\"]+)\")?)*)\s*>|<\/([A-Z][A-Z0-9]*)\s*>/i
const attributes_regex = /([A-Z][A-Z0-9]*)(="[^\"]+\")?/ig

function sanitizeInline(html, options) {
  let match = tag_regex.exec(html)
  if (!match) {
    return ''
  }
  
  const { allowedTags, allowedAttributes, allowedIframeHostnames, selfClosing, allowedSchemesAppliedToAttributes } = options
  
  if (match[1] !== null) {
    // opening tag
    const tag = match[1].toLowerCase()
    if (allowedTags.indexOf(tag) === -1) {
      return ''
    }
    
    const attributes = match[2]
    
    let attrs = ''
    let name
    let value
    
    while ((match = attributes_regex.exec(attributes))) {
      name = match[1].toLowerCase()
      value = match[2]
      
      if (allowedAttributes['*'].indexOf(name) !== -1 || (allowedAttributes[tag] && allowedAttributes[tag].indexOf(name) !== -1)) {
        if (allowedSchemesAppliedToAttributes.indexOf(name) !== -1) {
          if (naughtyHRef(value) || (tag === 'iframe' && name === 'src' && naughtyIFrame(value))) {
            continue
          }
        }
        
        attrs += ` ${name}${value}`
      }
    }
    
    if (selfClosing.indexOf(tag)) {
      return '<' + tag + attrs + ' />'
    } else {
      return '<' + tag + attrs + '>'
    }
  } else {
    // closing tag
    if (allowedTags.indexOf(match[3].toLowerCase()) !== -1) {
      return html
    } else {
      return ''
    }
  }
}

function naughtyHRef(name, href, options) {
  href = href.replace(/[\x00-\x20]+/g, '')
  href = href.replace(/<\!\-\-.*?\-\-\>/g, '')
  
  const matches = href.match(/^([a-zA-Z]+)\:/)
  if (!matches) {
    if (href.match(/^[\/\\]{2}/)) {
      return !options.allowProtocolRelative
    }

    // No scheme
    return false
  }

  const scheme = matches[1].toLowerCase()

  return options.allowedSchemes.indexOf(scheme) === -1
}

function naughtyIFrame(src) {
  try {
    const parsed = url.parse(src, false, true)
    
    return allowedIframeHostnames.index(parsed.hostname) === -1
  } catch (e) {
    return true
  }
}
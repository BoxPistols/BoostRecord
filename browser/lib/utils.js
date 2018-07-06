export function lastFindInArray (array, callback) {
  for (let i = array.length - 1; i >= 0; --i) {
    if (callback(array[i], i, array)) {
      return array[i]
    }
  }
}

export function escapeHtmlCharacters (html, opt = { detectCodeBlock: false }) {
  const matchHtmlRegExp = /["'&<>]/g
  const escapes = ['&quot;', '&amp;', '&#39;', '&lt;', '&gt;']
  let match = null
  const replaceAt = (str, index, replace) =>
    str.substr(0, index) +
    replace +
    str.substr(index + replace.length - (replace.length - 1))

  // detecting code block
  while ((match = matchHtmlRegExp.exec(html)) != null) {
    const current = { char: match[0], index: match.index }
    if (opt.detectCodeBlock) {
      // position of the nearest line start
      let previousLineEnd = current.index - 1
      while (html[previousLineEnd] !== '\n' && previousLineEnd !== -1) {
        previousLineEnd--
      }
      // 4 spaces means this character is in a code block
      if (
        html[previousLineEnd + 1] === ' ' &&
        html[previousLineEnd + 2] === ' ' &&
        html[previousLineEnd + 3] === ' ' &&
        html[previousLineEnd + 4] === ' '
      ) {
        // so skip it
        continue
      }
    }
    // otherwise, escape it !!!
    if (current.char === '&') {
      let nextStr = ''
      let nextIndex = current.index
      let escapedStr = false
      // maximum length of an escape string is 5. For example ('&quot;')
      while (nextStr.length <= 5) {
        nextStr += html[nextIndex]
        nextIndex++
        if (escapes.indexOf(nextStr) !== -1) {
          escapedStr = true
          break
        }
      }
      if (!escapedStr) {
        // this & char is not a part of an escaped string
        html = replaceAt(html, current.index, '&amp;')
      }
    } else if (current.char === '"') {
      html = replaceAt(html, current.index, '&quot;')
    } else if (current.char === "'") {
      html = replaceAt(html, current.index, '&#39;')
    } else if (current.char === '<') {
      html = replaceAt(html, current.index, '&lt;')
    } else if (current.char === '>') {
      html = replaceAt(html, current.index, '&gt;')
    }
  }
  return html
}

export function isObjectEqual (a, b) {
  const aProps = Object.getOwnPropertyNames(a)
  const bProps = Object.getOwnPropertyNames(b)

  if (aProps.length !== bProps.length) {
    return false
  }

  for (var i = 0; i < aProps.length; i++) {
    const propName = aProps[i]
    if (a[propName] !== b[propName]) {
      return false
    }
  }
  return true
}

export default {
  lastFindInArray,
  escapeHtmlCharacters,
  isObjectEqual
}

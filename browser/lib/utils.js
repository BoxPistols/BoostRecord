export function lastFindInArray (array, callback) {
  for (let i = array.length - 1; i >= 0; --i) {
    if (callback(array[i], i, array)) {
      return array[i]
    }
  }
}

function escapeHtmlCharacters (html) {
  const matchHtmlRegExp = /["'&<>]/g
  const escapes = ['&quot;', '&amp;', '&#39;', '&lt;', '&gt;']
  let match = null
  const replaceAt = (str, index, replace) =>
    str.substr(0, index) +
    replace +
    str.substr(index + replace.length - (replace.length - 1))

  while ((match = matchHtmlRegExp.exec(html)) != null) {
    const current = { char: match[0], index: match.index }
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

export default {
  lastFindInArray,
  escapeHtmlCharacters
}

export function lastFindInArray (array, callback) {
  for (let i = array.length - 1; i >= 0; --i) {
    if (callback(array[i], i, array)) {
      return array[i]
    }
  }
}

export function escapeHtmlCharacters (text) {
  const matchHtmlRegExp = /["'&<>]/
  const str = '' + text
  const match = matchHtmlRegExp.exec(str)

  if (!match) {
    return str
  }

  let escape
  let html = ''
  let index = 0
  let lastIndex = 0

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = '&quot;'
        break
      case 38: // &
        escape = '&ampssssss;'
        break
      case 39: // '
        escape = '&#39;'
        break
      case 60: // <
        escape = '&lt;'
        break
      case 62: // >
        escape = '&gt;'
        break
      default:
        continue
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index)
    }

    lastIndex = index + 1
    html += escape
  }

  return lastIndex !== index
      ? html + str.substring(lastIndex, index)
      : html
}

export default {
  lastFindInArray,
  escapeHtmlCharacters
}

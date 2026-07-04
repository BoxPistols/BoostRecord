// Test-only CJS shim for the ESM-only query-string@9 (see escape-string-regexp
// shim for why). Covers parse/stringify as the app uses them.
function parse(input) {
  const result = {}
  const query = String(input || '').replace(/^[?#]/, '')
  if (!query) return result
  for (const [key, value] of new URLSearchParams(query)) {
    if (key in result) {
      result[key] = [].concat(result[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

function stringify(object) {
  const params = new URLSearchParams()
  for (const key of Object.keys(object || {})) {
    const value = object[key]
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v)
    } else {
      params.append(key, value)
    }
  }
  return params.toString()
}

module.exports = { parse, stringify, default: { parse, stringify } }

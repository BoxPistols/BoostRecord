// API-key resolution for the AI writing-assist. Priority:
//   1. the key typed into Preferences right now (so the connection test can try
//      a key before it is saved)
//   2. the key saved in the OS credential store (lib/ai/secureKeys.js)
//   3. the provider's environment variable (in priority order)
// Kept separate from ipc.js so it can be unit-tested without pulling in the
// streaming SDK code (`for await`, which the legacy jest Babel can't parse).

const ENV_KEYS = {
  openai: ['OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY']
}

function resolveKey(provider, overrideKey, storedKey) {
  if (overrideKey && String(overrideKey).trim())
    return String(overrideKey).trim()
  if (storedKey && String(storedKey).trim()) return String(storedKey).trim()
  for (const name of ENV_KEYS[provider] || []) {
    if (process.env[name]) return process.env[name]
  }
  return null
}

/**
 * その provider が環境変数だけで動くかどうか。**値は返さない。**
 * 「押しても必ず失敗する導線を出さない」ために renderer 側が必要とするが、
 * キー本体を renderer へ出す口は作らない方針は変えない。
 *
 * @param {string} provider
 * @returns {boolean}
 */
function hasEnvKey(provider) {
  return (ENV_KEYS[provider] || []).some(name => {
    const value = process.env[name]
    return typeof value === 'string' && value.trim() !== ''
  })
}

module.exports = { resolveKey, hasEnvKey, ENV_KEYS }

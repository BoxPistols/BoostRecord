// API-key resolution for the AI writing-assist. A Preferences override always
// wins; otherwise the provider's environment variable (in priority order).
// Kept separate from ipc.js so it can be unit-tested without pulling in the
// streaming SDK code (`for await`, which the legacy jest Babel can't parse).

const ENV_KEYS = {
  openai: ['OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY']
}

function resolveKey(provider, overrideKey) {
  if (overrideKey && String(overrideKey).trim())
    return String(overrideKey).trim()
  for (const name of ENV_KEYS[provider] || []) {
    if (process.env[name]) return process.env[name]
  }
  return null
}

module.exports = { resolveKey, ENV_KEYS }

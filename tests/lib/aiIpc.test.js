// Unit tests for API-key resolution: a Preferences override always wins, else
// the provider's environment variable (in priority order), else null.
const { resolveKey } = require('../../lib/ai/keys')

const TOUCHED = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENAI_API_KEY'
]

describe('resolveKey', () => {
  let saved
  beforeEach(() => {
    saved = {}
    for (const name of TOUCHED) {
      saved[name] = process.env[name]
      delete process.env[name]
    }
  })
  afterEach(() => {
    for (const name of TOUCHED) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  })

  it('prefers the explicit override key', () => {
    process.env.OPENAI_API_KEY = 'env-key'
    expect(resolveKey('openai', 'override-key')).toBe('override-key')
  })

  it('trims the override and ignores a blank one, falling back to env', () => {
    process.env.OPENAI_API_KEY = 'env-key'
    expect(resolveKey('openai', '  spaced  ')).toBe('spaced')
    expect(resolveKey('openai', '   ')).toBe('env-key')
  })

  it('reads the provider env var when no override is given', () => {
    process.env.OPENAI_API_KEY = 'env-key'
    expect(resolveKey('openai', '')).toBe('env-key')
  })

  it('honours gemini env var priority (GEMINI over GOOGLE)', () => {
    process.env.GOOGLE_API_KEY = 'google-key'
    expect(resolveKey('gemini', '')).toBe('google-key')
    process.env.GEMINI_API_KEY = 'gemini-key'
    expect(resolveKey('gemini', '')).toBe('gemini-key')
  })

  it('returns null for an unknown provider or when nothing is set', () => {
    expect(resolveKey('anthropic', '')).toBeNull()
    expect(resolveKey('openai', '')).toBeNull()
  })

  // 資格情報ストアの鍵は「設定画面でいま打った鍵」より弱く、環境変数より強い。
  // 打った鍵が勝たないと、保存前の接続テストが古い鍵で走ってしまう
  it('prefers the credential-store key over the env var', () => {
    process.env.OPENAI_API_KEY = 'env-key'
    expect(resolveKey('openai', '', 'stored-key')).toBe('stored-key')
  })

  it('still lets the typed override win over the stored key', () => {
    expect(resolveKey('openai', 'typed-key', 'stored-key')).toBe('typed-key')
  })

  it('falls back to the env var when the stored key is empty', () => {
    process.env.OPENAI_API_KEY = 'env-key'
    expect(resolveKey('openai', '', '')).toBe('env-key')
    expect(resolveKey('openai', '', null)).toBe('env-key')
  })
})

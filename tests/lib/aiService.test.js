// Unit tests for the AI provider-routing pure functions. These decide which
// SDK a model id is sent to and which token/param shape it needs — cheap to get
// wrong, so pin the behaviour.
const { pickProvider, isOpenAiReasoning } = require('../../lib/ai/providers')

describe('pickProvider', () => {
  it('routes OpenAI model ids to openai', () => {
    expect(pickProvider('gpt-5-mini')).toBe('openai')
    expect(pickProvider('gpt-4o')).toBe('openai')
    expect(pickProvider('o1')).toBe('openai')
    expect(pickProvider('o3-mini')).toBe('openai')
    expect(pickProvider('chatgpt-4o-latest')).toBe('openai')
  })

  it('routes Gemini/Gemma model ids to gemini', () => {
    expect(pickProvider('gemini-2.5-flash')).toBe('gemini')
    expect(pickProvider('gemma-2-9b')).toBe('gemini')
  })

  it('returns null for unknown or empty model ids', () => {
    expect(pickProvider('llama-3')).toBeNull()
    expect(pickProvider('claude-3')).toBeNull()
    expect(pickProvider('')).toBeNull()
  })
})

describe('isOpenAiReasoning', () => {
  it('is true for GPT-5 / o1 / o3 reasoning models (max_completion_tokens, no temperature)', () => {
    expect(isOpenAiReasoning('gpt-5-mini')).toBe(true)
    expect(isOpenAiReasoning('o1')).toBe(true)
    expect(isOpenAiReasoning('o3-mini')).toBe(true)
  })

  it('is false for classic chat models (max_tokens + temperature)', () => {
    expect(isOpenAiReasoning('gpt-4o')).toBe(false)
    expect(isOpenAiReasoning('gpt-4')).toBe(false)
    expect(isOpenAiReasoning('gemini-2.5-flash')).toBe(false)
  })
})

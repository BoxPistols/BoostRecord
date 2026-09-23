// Pure provider-routing helpers for the AI writing-assist. Kept free of the
// streaming SDK code (which uses `for await`, unparseable by the legacy Babel
// the jest suite runs) so this logic stays unit-testable in Node.

// Choose the SDK for a model id by its prefix.
function pickProvider(model) {
  if (/^(gpt-|o1|o3|chatgpt)/i.test(model)) return 'openai'
  if (/^(gemini-|gemma-)/i.test(model)) return 'gemini'
  return null
}

// GPT-5 / o1 / o3 reasoning models: max_completion_tokens + no sampling params.
// gpt-6以降も同じ扱い。gpt-5だけを見るとgpt-6-lunaがmax_tokens+temperatureに落ちて400になる
function isOpenAiReasoning(model) {
  return /^(gpt-([5-9]|[1-9]\d)|o1|o3)/i.test(model)
}

module.exports = { pickProvider, isOpenAiReasoning }

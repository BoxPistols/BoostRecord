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
function isOpenAiReasoning(model) {
  return /^(gpt-5|o1|o3)/i.test(model)
}

module.exports = { pickProvider, isOpenAiReasoning }

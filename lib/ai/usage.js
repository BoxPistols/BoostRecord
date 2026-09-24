// APIが返す使用量を、プロバイダによらない形にそろえる（純粋関数）。
// 画像の分も入力トークンに含まれて返ってくるので、ここでは足し引きしない

/**
 * OpenAIのusage（stream_options.include_usageの最後のチャンク）
 * @returns {{inputTokens:number, cachedInputTokens:number, outputTokens:number, reasoningTokens:number}|null}
 */
function normalizeOpenAiUsage(usage) {
  if (!usage) return null
  const prompt = usage.prompt_tokens_details || {}
  const completion = usage.completion_tokens_details || {}
  return {
    inputTokens: usage.prompt_tokens || 0,
    cachedInputTokens: prompt.cached_tokens || 0,
    // 推論トークンはcompletion_tokensに含まれ、出力として課金される
    outputTokens: usage.completion_tokens || 0,
    reasoningTokens: completion.reasoning_tokens || 0
  }
}

/**
 * GeminiのusageMetadata。思考トークンは出力とは別に返るので出力に足す
 */
function normalizeGeminiUsage(meta) {
  if (!meta) return null
  const thoughts = meta.thoughtsTokenCount || 0
  return {
    inputTokens: meta.promptTokenCount || 0,
    cachedInputTokens: meta.cachedContentTokenCount || 0,
    outputTokens: (meta.candidatesTokenCount || 0) + thoughts,
    reasoningTokens: thoughts
  }
}

module.exports = { normalizeOpenAiUsage, normalizeGeminiUsage }

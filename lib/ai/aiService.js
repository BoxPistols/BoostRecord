// Main-process AI service for the inline writing-assist feature.
//
// Runs OpenAI / Google Gemini from the Electron MAIN process (plain Node) so the
// modern SDKs never go through the webpack-1 renderer bundle and there is no
// browser CORS to fight. Provider is chosen from the model-id prefix.
//
// Traps baked in (per peer machining-fundamentals, who runs the same providers
// over raw fetch on a Worker):
//   - GPT-5 / o1 / o3 reasoning models take `max_completion_tokens` and reject
//     `temperature`/`top_p` with a 400; older GPT-4 models are the opposite.
//   - Gemini's OpenAI-compat endpoint is flaky, so we use the native
//     `generateContentStream`; Gemini 2.5 spends reasoning tokens, so pad the
//     output cap or the visible body gets truncated/empty.

const OpenAILib = require('openai')
const OpenAI = OpenAILib.OpenAI || OpenAILib.default || OpenAILib
const { GoogleGenAI } = require('@google/genai')
const { pickProvider, isOpenAiReasoning } = require('./providers')
const { buildOpenAiMessages, buildGeminiContents } = require('./imageInput')
const { normalizeOpenAiUsage, normalizeGeminiUsage } = require('./usage')

async function runOpenAI(opts, onDelta, onFinish) {
  const client = new OpenAI({ apiKey: opts.apiKey })
  const body = {
    model: opts.model,
    stream: true,
    messages: buildOpenAiMessages(opts)
  }
  if (isOpenAiReasoning(opts.model)) {
    body.max_completion_tokens = opts.maxOutputTokens
    // 既定のmediumだと待ち時間が長い。画像の読み取りなど指定があるときだけ渡す
    if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort
  } else {
    body.max_tokens = opts.maxOutputTokens
    body.temperature = opts.temperature
  }
  // 使用量は最後のチャンクにだけ載る（choicesは空）。要るときだけ頼む
  if (onFinish) body.stream_options = { include_usage: true }
  const stream = await client.chat.completions.create(body)
  let full = ''
  let usage = null
  let truncated = false
  for await (const chunk of stream) {
    if (chunk.usage) usage = chunk.usage
    const choice = chunk.choices && chunk.choices[0]
    // 出力の上限で止まったときはfinish_reasonが'length'になる
    if (choice && choice.finish_reason === 'length') truncated = true
    const delta = choice && choice.delta && choice.delta.content
    if (delta) {
      full += delta
      if (onDelta) onDelta(delta)
    }
  }
  if (onFinish) onFinish({ usage: normalizeOpenAiUsage(usage), truncated })
  return full
}

async function runGemini(opts, onDelta, onFinish) {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey })
  // Gemini 2.5 burns reasoning tokens before any visible text; pad the cap so the
  // answer body isn't cut off (empty/truncated output otherwise).
  const cap = opts.maxOutputTokens + 1200
  const stream = await ai.models.generateContentStream({
    model: opts.model,
    contents: buildGeminiContents(opts),
    config: {
      // ContentUnion accepts a bare string; simpler than wrapping in { parts }.
      systemInstruction: opts.system,
      maxOutputTokens: cap,
      temperature: opts.temperature
    }
  })
  let full = ''
  let usage = null
  let truncated = false
  for await (const chunk of stream) {
    // usageMetadataは途中のチャンクにも累計で載るので、最後の値を使う
    if (chunk.usageMetadata) usage = chunk.usageMetadata
    const candidate = chunk.candidates && chunk.candidates[0]
    if (candidate && candidate.finishReason === 'MAX_TOKENS') truncated = true
    const text = chunk.text // `text` is a getter that joins the candidate parts
    if (text) {
      full += text
      if (onDelta) onDelta(text)
    }
  }
  if (onFinish) onFinish({ usage: normalizeGeminiUsage(usage), truncated })
  return full
}

/**
 * Stream an AI completion. Calls onDelta(text) for each chunk and resolves with
 * the full text. Throws on auth / API errors (the IPC layer turns that into a
 * rejected invoke the renderer surfaces).
 *
 * @param {{provider?:string, model:string, apiKey:string, system:string,
 *          prompt:string, maxOutputTokens?:number, temperature?:number}} req
 * @param {(delta:string)=>void} [onDelta]
 * @param {(info:{usage:Object|null, truncated:boolean})=>void} [onFinish]
 *   終了時に使用量と「出力の上限で止まったか」を受け取る
 * @returns {Promise<string>}
 */
function streamCompletion(req, onDelta, onFinish) {
  const provider = req.provider || pickProvider(req.model)
  if (!provider) throw new Error(`Unknown AI provider for model "${req.model}"`)
  if (!req.model) throw new Error('No model configured (Preferences -> AI)')
  if (!req.apiKey) {
    throw new Error(
      `No API key for ${provider}. Set the environment variable or Preferences -> AI.`
    )
  }
  const opts = {
    apiKey: req.apiKey,
    model: req.model,
    system: req.system || 'You are a precise writing assistant.',
    prompt: req.prompt,
    maxOutputTokens: req.maxOutputTokens || 2000,
    temperature: req.temperature == null ? 0.7 : req.temperature,
    image: req.image,
    reasoningEffort: req.reasoningEffort
  }
  return provider === 'openai'
    ? runOpenAI(opts, onDelta, onFinish)
    : runGemini(opts, onDelta, onFinish)
}

module.exports = { streamCompletion, pickProvider, isOpenAiReasoning }

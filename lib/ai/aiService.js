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

async function runOpenAI(opts, onDelta) {
  const client = new OpenAI({ apiKey: opts.apiKey })
  const body = {
    model: opts.model,
    stream: true,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.prompt }
    ]
  }
  if (isOpenAiReasoning(opts.model)) {
    body.max_completion_tokens = opts.maxOutputTokens
  } else {
    body.max_tokens = opts.maxOutputTokens
    body.temperature = opts.temperature
  }
  const stream = await client.chat.completions.create(body)
  let full = ''
  for await (const chunk of stream) {
    const choice = chunk.choices && chunk.choices[0]
    const delta = choice && choice.delta && choice.delta.content
    if (delta) {
      full += delta
      if (onDelta) onDelta(delta)
    }
  }
  return full
}

async function runGemini(opts, onDelta) {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey })
  // Gemini 2.5 burns reasoning tokens before any visible text; pad the cap so the
  // answer body isn't cut off (empty/truncated output otherwise).
  const cap = opts.maxOutputTokens + 1200
  const stream = await ai.models.generateContentStream({
    model: opts.model,
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    config: {
      // ContentUnion accepts a bare string; simpler than wrapping in { parts }.
      systemInstruction: opts.system,
      maxOutputTokens: cap,
      temperature: opts.temperature
    }
  })
  let full = ''
  for await (const chunk of stream) {
    const text = chunk.text // `text` is a getter that joins the candidate parts
    if (text) {
      full += text
      if (onDelta) onDelta(text)
    }
  }
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
 * @returns {Promise<string>}
 */
function streamCompletion(req, onDelta) {
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
    temperature: req.temperature == null ? 0.7 : req.temperature
  }
  return provider === 'openai'
    ? runOpenAI(opts, onDelta)
    : runGemini(opts, onDelta)
}

module.exports = { streamCompletion, pickProvider, isOpenAiReasoning }

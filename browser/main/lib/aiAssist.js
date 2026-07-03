// Renderer-side wrapper over the main-process 'ai:run' IPC (see lib/ai/ipc.js).
//
// runAiAction() streams text deltas to onDelta and resolves with the full text.
// Provider / model / key come from config (Preferences -> AI); the main process
// falls back to the provider's env var when no key is set.
const { ipcRenderer } = require('electron')
import ConfigManager from 'browser/main/lib/ConfigManager'

let runCounter = 0

// action -> { label, mode, system }.
//   mode 'replace'  : overwrite the selection with the result
//   mode 'append'   : keep the selection, insert the result after it
export const AI_ACTIONS = {
  summarize: {
    label: '要約',
    mode: 'append',
    system:
      "Summarize the user's text concisely, in the same language as the text. Output only the summary — no preamble, no labels."
  },
  rewrite: {
    label: '書き換え（簡潔・明快）',
    mode: 'replace',
    system:
      "Rewrite the user's text to be clearer and more concise while preserving its meaning and language. Output only the rewritten text — no preamble."
  },
  translate: {
    label: '翻訳（EN ⇄ JA）',
    mode: 'replace',
    system:
      "Translate the user's text between English and Japanese: detect the source language and translate to the other one. Output only the translation — no preamble, no notes."
  },
  continue: {
    label: '続きを書く',
    mode: 'append',
    system:
      "Continue the user's text naturally in the same language, voice, and format. Output only the continuation."
  },
  explainCode: {
    label: 'コードを説明',
    mode: 'append',
    system:
      "Explain what the user's code does, concisely, in Japanese. Output only the explanation."
  }
}

export function runAiAction(actionKey, text, onDelta) {
  const action = AI_ACTIONS[actionKey]
  if (!action)
    return Promise.reject(new Error(`Unknown AI action: ${actionKey}`))

  const config = ConfigManager.get()
  const ai = config.ai || {}
  const provider = ai.provider || 'openai'
  const providerCfg = ai[provider] || {}
  const runId = `ai-${++runCounter}-${Date.now()}`

  const onChunk = (e, msg) => {
    if (msg && msg.runId === runId && onDelta) onDelta(msg.delta)
  }
  ipcRenderer.on('ai:chunk', onChunk)

  const cleanup = () => ipcRenderer.removeListener('ai:chunk', onChunk)

  return ipcRenderer
    .invoke('ai:run', {
      runId,
      provider,
      model: providerCfg.model,
      apiKey: providerCfg.apiKey || '',
      system: action.system,
      prompt: text
    })
    .then(
      full => {
        cleanup()
        return full
      },
      err => {
        cleanup()
        throw err
      }
    )
}

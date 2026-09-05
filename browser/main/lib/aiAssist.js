// Renderer-side wrapper over the main-process 'ai:run' IPC (see lib/ai/ipc.js).
//
// runAiAction() streams text deltas to onDelta and resolves with the full text.
// Provider / model / key come from config (Preferences -> AI); the main process
// falls back to the provider's env var when no key is set.
const { ipcRenderer } = require('electron')
import ConfigManager from 'browser/main/lib/ConfigManager'
// モデル一覧は browser/main/lib/aiModels が単一の情報源
import { DEFAULT_MODELS } from 'browser/main/lib/aiModels'

let runCounter = 0

// Whole-note actions can be huge; cap what we send to the API.
const MAX_INPUT_CHARS = 20000

// action -> { label, mode, system }.
//   mode 'replace'      : overwrite the selection with the result
//   mode 'append'       : keep the selection, insert the result after it
//   mode 'appendToEnd'  : whole-note scope; stream under `heading` at the end
//   mode 'replaceNote'  : whole-note (or selection) rewrite; the result replaces
//                         the source in one undoable edit after it fully arrives
export const AI_ACTIONS = {
  applyReview: {
    label: '校閲を反映（校閲 (AI) の指摘を本文に適用して節を消す）',
    mode: 'replaceNote',
    scope: 'note',
    maxOutputTokens: 8000,
    system: [
      'The user\'s note ends with one or more review sections whose heading is "## 校閲 (AI)" (a bullet list of "fragment → fix: reason").',
      'Apply every suggested fix to the body of the note, then remove the review section(s) entirely. If a suggestion is ambiguous, apply the most conservative reading. Do not apply anything that is not in the review.',
      'Keep everything else exactly as written: wording, order, headings, lists, code blocks, links, front matter, and the original language. Do not add commentary.',
      'If there is no review section, return the note unchanged.',
      'Output only the full corrected note as Markdown. Do not wrap it in a code fence.'
    ].join('\n')
  },
  proofreadApply: {
    label: '校閲して直す（指摘を出さず本文を直接直す）',
    mode: 'replaceNote',
    scope: 'noteOrSelection',
    maxOutputTokens: 8000,
    system: [
      "You are a careful copy editor. Fix typos, grammatical errors, unclear phrasing, inconsistent terminology, and inconsistent notation in the user's text, directly in the text.",
      'Change as little as possible: keep the meaning, structure, headings, lists, code blocks, links, numbers, dates, and the original language. Do not add, remove, or reorder content. Do not add commentary or a list of changes.',
      'Output only the corrected text as Markdown. Do not wrap it in a code fence.'
    ].join('\n')
  },
  dedupeNote: {
    label: '重複をまとめる（重複・散らばった箇所を統合して整える）',
    mode: 'replaceNote',
    scope: 'noteOrSelection',
    maxOutputTokens: 8000,
    system: [
      "Tidy the user's note by merging duplicated or overlapping content.",
      'When the same topic, list, or statement appears in more than one place, combine them into one place under the most appropriate heading and keep every unique fact, number, date, and item exactly once. Prefer the more complete or more recent phrasing when two versions differ, and never drop information that appears in only one of them.',
      'Keep the heading hierarchy, list styles, code blocks, links, and the original language. Do not rewrite sentences that are not part of a duplication. Do not add commentary or notes about what was merged.',
      'Output only the tidied text as Markdown. Do not wrap it in a code fence.'
    ].join('\n')
  },
  convertNote: {
    label: '整形（Apple メモなどの平文を BoostRecord 形式に）',
    mode: 'replaceNote',
    scope: 'noteOrSelection',
    // 全文の書き直しなので既定の 2000 トークンでは途中で切れる
    maxOutputTokens: 8000,
    system: [
      'You convert loosely formatted notes (for example text pasted from Apple Notes) into clean, well-structured Markdown for a Markdown note app.',
      'Rules:',
      '- Keep every fact, number, date, name, and item. Never invent, summarize away, or reorder content that has a meaningful order. Keep the original language.',
      '- Infer the heading hierarchy: the first line that names the note becomes "# ", major sections "## ", subsections "### ". Lines that act as labels (short, followed by a list or a block) become headings or bold labels, not plain paragraphs.',
      '- Remove decorative markers that only mimic headings or bullets (●, ◉, ■, ▶, emoji used as bullets). Keep emoji that carry meaning inside sentences.',
      '- Normalize lists: "- " for bullets, "1. " for ordered steps, "- [ ] " / "- [x] " for checkboxes. Turn aligned columns of the form "item   4〜5枚" into "- [ ] item 4〜5枚" (single space) or a Markdown table when there are 3 or more columns.',
      '- Merge duplicated or overlapping sections: when the same topic appears twice, combine them under one heading and keep all unique lines once. Note nothing about the merge in the output.',
      '- Keep paragraphs as paragraphs separated by one blank line. Do not wrap the result in a code fence. Do not add commentary before or after.',
      'Output only the converted Markdown.'
    ].join('\n')
  },
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
  },
  summarizeNote: {
    label: 'ページ要約',
    mode: 'appendToEnd',
    scope: 'note',
    heading: '## 要約 (AI)',
    system:
      "Summarize the user's note concisely in the same language as the note. Start with one sentence stating the note's purpose, then a short bullet list of the key points. Output only the summary — no preamble, no headings."
  },
  proofread: {
    label: '校閲',
    mode: 'appendToEnd',
    scope: 'noteOrSelection',
    heading: '## 校閲 (AI)',
    system:
      "You are a careful proofreader. Review the user's text for typos, grammatical errors, unclear phrasing, and inconsistent terminology. Reply in the same language as the text, as a concise bullet list where each item shows the problematic fragment, the suggested fix, and a one-phrase reason. If there are no issues, say so in one line. Output only the review."
  }
}

// 接続テストの最小リクエスト。課金を最小にするため、ごく短い応答だけ求める
const TEST_SYSTEM = 'Reply with exactly: OK'
const TEST_PROMPT = 'ping'

// Electron は ipcMain.handle の reject を
// 「Error invoking remote method 'ai:run': Error: <本文>」で包む。
// 設定画面にそのまま出すと読めないので本文だけ取り出す
function unwrapIpcError(err) {
  // message が空文字の Error だと String(err) は "Error" になり、
  // 利用者には何も伝わらない。message があればそれだけを見る
  const raw = err && typeof err.message === 'string' ? err.message : String(err)
  const m = raw.match(
    /Error invoking remote method '[^']*':\s*(?:Error:\s*)?([\s\S]*)/
  )
  return (m ? m[1] : raw).trim() || 'Unknown error'
}

/**
 * 指定した設定で実際に API を1回叩き、疎通の成否を返す。
 * 保存済み設定ではなく「入力中の値」で試せるよう、引数で受け取る。
 * apiKey が空でも呼ぶ（main 側が環境変数へフォールバックするため、
 * 実際に使える状態かどうかをそのまま確かめられる）。
 *
 * @param {{provider: string, model: string, apiKey: string}} options
 * @returns {Promise<{ok: boolean, message: string}>} 例外は投げない
 */
export function testAiConnection({ provider, model, apiKey }) {
  const runId = `ai-test-${++runCounter}-${Date.now()}`
  return ipcRenderer
    .invoke('ai:run', {
      runId,
      provider,
      model: model || DEFAULT_MODELS[provider],
      apiKey: apiKey || '',
      system: TEST_SYSTEM,
      prompt: TEST_PROMPT
    })
    .then(
      () => ({ ok: true, message: '' }),
      err => ({ ok: false, message: unwrapIpcError(err) })
    )
}

/**
 * AI_ACTIONS に無い用途で system / prompt を直接指定して1回だけ投げる。
 * 生成物の検証は呼び出し側の責任（カスタム CSS なら customCSSGenerator）。
 *
 * @param {{system: string, prompt: string, onDelta?: function(string): void}} options
 * @returns {Promise<string>} 応答の全文
 */
export function runAiPrompt({ system, prompt, onDelta, maxOutputTokens }) {
  const config = ConfigManager.get()
  const ai = config.ai || {}
  const provider = ai.provider || 'openai'
  const providerCfg = ai[provider] || {}
  const runId = `ai-${++runCounter}-${Date.now()}`
  const input =
    prompt.length > MAX_INPUT_CHARS ? prompt.slice(0, MAX_INPUT_CHARS) : prompt

  const onChunk = (e, msg) => {
    if (msg && msg.runId === runId && onDelta) onDelta(msg.delta)
  }
  ipcRenderer.on('ai:chunk', onChunk)
  const cleanup = () => ipcRenderer.removeListener('ai:chunk', onChunk)

  return ipcRenderer
    .invoke('ai:run', {
      runId,
      provider,
      model: providerCfg.model || DEFAULT_MODELS[provider],
      apiKey: providerCfg.apiKey || '',
      system,
      prompt: input,
      maxOutputTokens
    })
    .then(
      full => {
        cleanup()
        return full
      },
      err => {
        cleanup()
        // Electron の包みを剥がしてから投げる。設定画面にそのまま出せるように
        throw new Error(unwrapIpcError(err))
      }
    )
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
  const input =
    text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text

  const onChunk = (e, msg) => {
    if (msg && msg.runId === runId && onDelta) onDelta(msg.delta)
  }
  ipcRenderer.on('ai:chunk', onChunk)

  const cleanup = () => ipcRenderer.removeListener('ai:chunk', onChunk)

  return ipcRenderer
    .invoke('ai:run', {
      runId,
      provider,
      model: providerCfg.model || DEFAULT_MODELS[provider],
      apiKey: providerCfg.apiKey || '',
      system: action.system,
      prompt: input,
      maxOutputTokens: action.maxOutputTokens
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

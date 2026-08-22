/**
 * @fileoverview Turns a natural-language instruction into custom CSS for the
 * markdown preview, and — more importantly — decides whether the model's
 * answer is safe to show at all.
 *
 * Everything here is pure: no Electron, no IPC, no DOM. The IPC call lives in
 * browser/main/lib/aiAssist.js and the UI in the Preferences UI tab, so the
 * part that has to be right can be unit-tested on its own.
 *
 * Two rules shape the design.
 *
 * - The preview injects this CSS into an iframe that renders the user's notes.
 *   A model that helpfully writes `@import url(https://…)` would make the
 *   preview phone home on every render. Anything that reaches the network, or
 *   that is not CSS at all, is refused rather than cleaned up.
 * - Refusing must never cost the user what they already wrote. `validate()`
 *   returns a verdict; it never returns "" as a value to save. The caller keeps
 *   the previous content whenever `ok` is false.
 */

/** Hard cap on what we accept back, so a runaway answer cannot be pasted in. */
export const MAX_GENERATED_CHARS = 20000

export const CUSTOM_CSS_SYSTEM_PROMPT = [
  'You write CSS for a Markdown preview pane rendered inside an iframe.',
  'The document body carries a data-theme attribute set to the UI theme name.',
  'Reply with CSS only: no explanation, no Markdown code fences, no HTML.',
  'Never use @import, never reference a remote url(), never use javascript:,',
  'expression() or behavior:. Keep colours theme-neutral (translucent greys)',
  'unless the user asks for a specific colour. Do not use !important unless the',
  'user explicitly asks for it — this stylesheet is already applied last.',
  'Output only the rules needed for the request; do not restate existing CSS.'
].join(' ')

/**
 * @param {object} options
 * @param {string} options.instruction  natural-language request
 * @param {string} [options.currentCSS] what is already in the box, for context
 * @param {string} [options.themeName]  the active UI theme
 * @returns {string} the user-side prompt
 */
export function buildCustomCSSPrompt({ instruction, currentCSS, themeName }) {
  const parts = ['Request:', String(instruction || '').trim()]
  if (themeName) {
    parts.push('', `Active theme (body[data-theme="${themeName}"]).`)
  }
  const existing = String(currentCSS || '').trim()
  if (existing !== '') {
    // 既存の CSS は「文脈」として渡す。書き換えて返させると、返答が壊れた
    // ときに利用者の記述ごと失う
    parts.push(
      '',
      'Existing custom CSS, for context only. Do not repeat it; write only the',
      'additional rules:',
      existing.length > 4000 ? existing.slice(0, 4000) : existing
    )
  }
  return parts.join('\n')
}

/**
 * Pulls the CSS out of an answer that may still be wrapped in a code fence.
 * Only the fence is unwrapped — no attempt is made to salvage CSS from prose,
 * because a partial salvage is exactly how a broken stylesheet gets saved.
 */
export function extractCSS(raw) {
  const text = String(raw == null ? '' : raw).trim()
  if (text === '') return ''
  const fenced = text.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/)
  if (fenced) return fenced[1].trim()
  return text
}

/** Comments are stripped for analysis only; the returned CSS keeps them. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ')
}

// name -> test. Each one is a way for a stylesheet to reach outside itself or
// stop being a stylesheet.
const FORBIDDEN = [
  { reason: 'at-import', test: /@import/i },
  { reason: 'remote-url', test: /url\(\s*['"]?(?:https?:)?\/\//i },
  { reason: 'javascript-url', test: /javascript\s*:/i },
  { reason: 'expression', test: /expression\s*\(/i },
  { reason: 'binding', test: /(?:-moz-binding|behavior)\s*:/i },
  { reason: 'markup', test: /<\s*\/?\s*(?:script|style|iframe|link)\b/i }
]

/**
 * @typedef {object} CSSVerdict
 * @property {boolean}  ok      safe to offer to the user
 * @property {string}   css     the cleaned CSS (empty when ok is false)
 * @property {string[]} reasons machine-readable refusal reasons
 * @property {string[]} notes   things worth showing but not worth refusing
 */

/**
 * @param {string} raw the model's answer
 * @returns {CSSVerdict}
 */
export function validateGeneratedCSS(raw) {
  const css = extractCSS(raw)
  const reasons = []
  const notes = []

  if (css === '') {
    return { ok: false, css: '', reasons: ['empty'], notes }
  }
  if (css.length > MAX_GENERATED_CHARS) {
    reasons.push('too-long')
  }

  const scanned = stripComments(css)

  FORBIDDEN.forEach(rule => {
    if (rule.test.test(scanned)) reasons.push(rule.reason)
  })

  const open = (scanned.match(/\{/g) || []).length
  const close = (scanned.match(/\}/g) || []).length
  if (open === 0) {
    // 波括弧が1つも無いものは CSS ではなく、たいてい断り書きか説明文
    reasons.push('not-css')
  } else if (open !== close) {
    reasons.push('unbalanced')
  }

  if (/!\s*important/i.test(scanned)) {
    // 危険ではないので拒否しない。ただし、この CSS は最後に当たるので
    // 普通は要らない。次に自分で書く規則が負けるようになる
    notes.push('uses-important')
  }

  return {
    ok: reasons.length === 0,
    css: reasons.length === 0 ? css : '',
    reasons,
    notes
  }
}

/**
 * Appends accepted CSS under a comment saying where it came from. Appending —
 * not replacing — is what keeps a bad answer from costing the user their work.
 *
 * @param {string} currentCSS
 * @param {string} generatedCSS  must already have passed validateGeneratedCSS
 * @param {string} headerComment localized one-line provenance note
 * @returns {string}
 */
export function appendGeneratedCSS(currentCSS, generatedCSS, headerComment) {
  const css = String(generatedCSS || '').trim()
  if (css === '') return typeof currentCSS === 'string' ? currentCSS : ''
  const header =
    headerComment == null
      ? null
      : `/* ${String(headerComment).replace(/\*\//g, '* /')} */`
  const block = header === null ? css : header + '\n' + css
  const existing = typeof currentCSS === 'string' ? currentCSS : ''
  if (existing.trim() === '') return block + '\n'
  return existing.replace(/\s*$/, '') + '\n\n' + block + '\n'
}

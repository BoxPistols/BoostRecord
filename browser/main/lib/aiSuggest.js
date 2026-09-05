// 文章の改善提案（Draftline / The-Write と同じ型）。
//
// 対象の文章を AI に渡し、「どこを（original）」「どう直すか（suggestion）」
// 「なぜ（explanation）」「種類（type）」の配列で受ける。1 件ずつ適用・却下できる
// ので、全文の書き直しより人が判断しやすい。
//
// 種類は Draftline と揃える: grammar / spelling / punctuation / style / clarity /
// ai-writing（AI 生成文にありがちな癖）

export const SUGGESTION_TYPES = [
  'grammar',
  'spelling',
  'punctuation',
  'style',
  'clarity',
  'ai-writing'
]

// 長い対象は先頭だけを見る（全文の書き直しではなく指摘なので、上限は緩め）
const MAX_INPUT_CHARS = 16000

function looksJapanese(text) {
  return /[぀-ヿ㐀-鿿]/.test(text)
}

/**
 * 分析の指示文。Draftline の文言を土台にし、Markdown ノート向けに
 * 「記法は壊さない」「original は完全一致」を強めた
 */
export function buildSuggestPrompt(text, custom) {
  const ja = looksJapanese(text)
  const extra =
    custom && custom.trim()
      ? (ja
          ? '\n\nユーザーからの追加指示: '
          : '\n\nAdditional instructions from the user: ') + custom.trim()
      : ''
  const body = text.slice(0, MAX_INPUT_CHARS)
  if (ja) {
    return `あなたはプロの日本語編集者です。以下の Markdown 文書を分析し、改善提案を出してください。${extra}

各提案は JSON 配列の要素として、次の形にしてください。
- "type": "grammar", "spelling", "punctuation", "style", "clarity", "ai-writing" のいずれか
- "original": 変更対象の原文。文書中の文字列と完全一致させる（1 行以内、前後の空白を含めない）
- "suggestion": 改善後のテキスト（original をそのまま置き換えられる形）
- "explanation": 変更理由を 1 文で（日本語）

守ること:
- Markdown の記法（#、-、[ ]、リンク、コードブロック、front matter）は提案の対象にしない。コードブロックの中身も対象外
- 事実・数字・日付・固有名詞は変えない
- 同じ箇所に複数の提案を出さない。提案は多くても 20 件まで。重要なものから並べる
- "ai-writing" は AI 生成文の癖に使う: 前置き宣言、接続詞の過剰、同じ語尾の連続、抽象的なバズワード、過度なヘッジ、定型の締め、根拠の無い評価語、使い古された比喩、「〜することができます」等の冗長表現

有効な JSON 配列のみを出力してください。それ以外のテキストは一切出力しないでください。

分析対象:
${body}`
  }
  return `You are a professional editor. Analyze the following Markdown document and propose improvements.${extra}

Return a JSON array where each item has:
- "type": one of "grammar", "spelling", "punctuation", "style", "clarity", "ai-writing"
- "original": the exact text to change (must match the document verbatim, within one line, no surrounding whitespace)
- "suggestion": the improved text (a drop-in replacement for original)
- "explanation": one sentence on why (in English)

Rules:
- Do not touch Markdown syntax (#, -, [ ], links, code blocks, front matter). Code block contents are out of scope.
- Do not change facts, numbers, dates, or proper nouns.
- One suggestion per location, at most 20 items, most important first.
- Use "ai-writing" for patterns typical of AI-generated text: preambles, overused conjunctions, repetitive endings, abstract buzzwords, hedging, formulaic closings, unsupported evaluations, cliched metaphors, filler phrases.

Respond ONLY with a valid JSON array. No other text.

Text to analyze:
${body}`
}

/**
 * 応答から提案の配列を取り出して正規化する。
 * コードフェンスや前置きが混ざっても、最初の [ … ] を JSON として読む。
 * 壊れていれば空配列（呼び手が「提案なし」と「失敗」を区別できるよう、
 * 失敗時は parsed=false を返す）
 */
export function parseSuggestions(content) {
  const src = String(content || '')
  const cleaned = src.replace(/```(?:json)?\s*/g, '').replace(/```/g, '')
  const m = cleaned.match(/\[[\s\S]*\]/)
  if (!m) return { parsed: false, suggestions: [] }
  let arr
  try {
    arr = JSON.parse(m[0])
  } catch (e) {
    return { parsed: false, suggestions: [] }
  }
  if (!Array.isArray(arr)) return { parsed: false, suggestions: [] }
  const seen = new Set()
  const out = []
  arr.forEach(item => {
    if (!item || typeof item !== 'object') return
    const original = String(item.original || '')
    const suggestion = item.suggestion == null ? '' : String(item.suggestion)
    if (!original.trim() || original === suggestion) return
    const key = original + ' ' + suggestion
    if (seen.has(key)) return
    seen.add(key)
    const rawType = String(item.type || '').replace(/_/g, '-')
    out.push({
      id: out.length,
      type: SUGGESTION_TYPES.indexOf(rawType) !== -1 ? rawType : 'style',
      original,
      suggestion,
      explanation: String(item.explanation || ''),
      status: 'pending'
    })
  })
  return { parsed: true, suggestions: out }
}

/**
 * 対象の文章を分析して提案を返す。
 * @param {string} text
 * @param {string} [custom] 追加の指示（「敬体に揃えて」等）
 * @returns {Promise<{parsed: boolean, suggestions: Array}>}
 */
export function runSuggest(text, custom) {
  // aiAssist は ConfigManager 経由で electron を読むので、呼ぶ時に読む
  const { runAiPrompt } = require('browser/main/lib/aiAssist')
  return runAiPrompt({
    system:
      'You output only JSON. Never wrap it in prose. Never include Markdown fences.',
    prompt: buildSuggestPrompt(text, custom),
    maxOutputTokens: 6000
  }).then(full => parseSuggestions(full))
}

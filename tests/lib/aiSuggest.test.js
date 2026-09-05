// 改善提案の応答の読み取り。前置きやフェンスが混ざっても配列を拾い、
// 壊れた要素は落とし、種類は既知のものに寄せる
const {
  parseSuggestions,
  buildSuggestPrompt
} = require('browser/main/lib/aiSuggest')

describe('parseSuggestions', () => {
  it('フェンスと前置きを剥がして配列を読む。id と status を付ける', () => {
    const r = parseSuggestions(
      '以下です。\n```json\n[{"type":"grammar","original":"食べれる","suggestion":"食べられる","explanation":"ら抜き"}]\n```'
    )
    expect(r.parsed).toBe(true)
    expect(r.suggestions).toEqual([
      {
        id: 0,
        type: 'grammar',
        original: '食べれる',
        suggestion: '食べられる',
        explanation: 'ら抜き',
        status: 'pending'
      }
    ])
  })

  it('原文が空・原文と提案が同じ・重複は落とし、未知の種類は style に寄せる', () => {
    const r = parseSuggestions(
      JSON.stringify([
        { type: 'tone', original: 'A', suggestion: 'B', explanation: '' },
        { type: 'style', original: 'A', suggestion: 'B' },
        { type: 'style', original: '', suggestion: 'x' },
        { type: 'ai_writing', original: 'C', suggestion: 'C' },
        { type: 'ai_writing', original: 'D', suggestion: 'E' }
      ])
    )
    expect(r.suggestions.map(s => [s.type, s.original])).toEqual([
      ['style', 'A'],
      ['ai-writing', 'D']
    ])
  })

  it('配列が無い / 壊れている応答は parsed=false', () => {
    expect(parseSuggestions('提案はありません。').parsed).toBe(false)
    expect(parseSuggestions('[{"type":').parsed).toBe(false)
  })
})

describe('buildSuggestPrompt', () => {
  it('日本語の文章には日本語の指示、英語には英語の指示を使う', () => {
    expect(buildSuggestPrompt('これは日本語です。')).toMatch(/日本語編集者/)
    expect(buildSuggestPrompt('This is English.')).toMatch(
      /professional editor/
    )
  })
  it('追加指示を末尾に添える', () => {
    expect(buildSuggestPrompt('テスト。', '敬体に揃えて')).toMatch(
      /追加指示: 敬体に揃えて/
    )
  })
})

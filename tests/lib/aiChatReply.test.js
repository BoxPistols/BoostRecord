// AI 編集アシスタントの返答の切り分け。「変更点」と「直した全文」を機械的に分ける
const { parseReply } = require('browser/main/modals/AiChatModal')

describe('parseReply', () => {
  it('変更点と revised フェンスの中身を分ける', () => {
    const r = parseReply(
      '- 冗長な語を削除\n- 表記を統一\n\n```revised\n# 見出し\n\n本文。\n```\n'
    )
    expect(r.notes).toBe('- 冗長な語を削除\n- 表記を統一')
    expect(r.revised).toBe('# 見出し\n\n本文。')
    expect(r.complete).toBe(true)
  })

  it('本文の中にコードブロックがあっても、最後の行頭 ``` を閉じとみなす', () => {
    const r = parseReply(
      '- 変更\n```revised\n本文\n```js\nconst a = 1\n```\n続き\n```'
    )
    expect(r.revised).toBe('本文\n```js\nconst a = 1\n```\n続き')
    expect(r.complete).toBe(true)
  })

  it('受信途中（閉じフェンス無し）は complete=false で、届いた分を返す', () => {
    const r = parseReply('- 変更\n```revised\n途中まで')
    expect(r.complete).toBe(false)
    expect(r.revised).toBe('途中まで')
  })

  it('フェンスが無い返答（質問への答え）は revised が null', () => {
    expect(parseReply('これは説明だけです。')).toEqual({
      notes: 'これは説明だけです。',
      revised: null,
      complete: true
    })
  })
})

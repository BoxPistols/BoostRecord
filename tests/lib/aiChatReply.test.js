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

describe('差分の取捨選択（AiChatModal と textDiff の組み合わせ）', () => {
  const { buildHunks, applyHunks } = require('browser/lib/textDiff')
  it('不採用にした塊は元の行が残り、採用した塊だけ変わる', () => {
    const before = '一。\n二。\n三。'
    const after = '壱。\n二。\n参。'
    const hunks = buildHunks(before, after)
    const ids = hunks.filter(h => h.type === 'change').map(h => h.id)
    expect(ids.length).toBe(2)
    // 2 つ目を除外
    expect(applyHunks(hunks, [ids[0]], after)).toBe('壱。\n二。\n三。')
  })
})

// prettier の markdown 整形は日本語と英数字の境目に半角スペースを差し込む。
// 整形するたびに書いていない空白が増えるので、出力を通してから詰める。
const { squeezeCjkSpacing } = require('browser/lib/squeezeCjkSpacing')

describe('squeezeCjkSpacing', () => {
  it('日本語と数字の間の空白を詰める', () => {
    expect(squeezeCjkSpacing('9 月 7 日（月）に往路')).toBe(
      '9月7日（月）に往路'
    )
    expect(squeezeCjkSpacing('妻と 2 人で 1 週間滞在します。')).toBe(
      '妻と2人で1週間滞在します。'
    )
  })

  it('日本語と英字の間の空白を詰める', () => {
    expect(squeezeCjkSpacing('「JR 線乗換口」の改札')).toBe(
      '「JR線乗換口」の改札'
    )
  })

  it('全角スペースも詰める', () => {
    expect(squeezeCjkSpacing('発車　15 分前')).toBe('発車15分前')
  })

  it('英文の語間は触らない', () => {
    expect(squeezeCjkSpacing('This is a normal sentence.')).toBe(
      'This is a normal sentence.'
    )
  })

  it('日本語どうしの空白は残す（意図して空けている場合がある）', () => {
    expect(squeezeCjkSpacing('往路 復路')).toBe('往路 復路')
  })

  it('リストの記号や見出しの記号は壊さない', () => {
    expect(squeezeCjkSpacing('- 項目 1')).toBe('- 項目1')
    expect(squeezeCjkSpacing('1. 西新井')).toBe('1. 西新井')
    expect(squeezeCjkSpacing('## 目的 1')).toBe('## 目的1')
  })

  it('コードフェンスの中は触らない', () => {
    const src = [
      '本文 1 行目',
      '```js',
      'const a = 1 // 説明 1',
      '```',
      '本文 2 行目'
    ].join('\n')
    expect(squeezeCjkSpacing(src)).toBe(
      ['本文1行目', '```js', 'const a = 1 // 説明 1', '```', '本文2行目'].join(
        '\n'
      )
    )
  })

  it('インラインコードの中は触らない', () => {
    expect(squeezeCjkSpacing('設定は `theme 1` です')).toBe(
      '設定は `theme 1` です'
    )
  })

  it('インデント 4 桁のコードブロックは触らない', () => {
    expect(squeezeCjkSpacing('    const a = 1 // 説明 1')).toBe(
      '    const a = 1 // 説明 1'
    )
  })

  it('表は詰めた後の幅で組み直す（桁揃えを崩さない）', () => {
    const src = [
      '| 区間         | 所要  |',
      '| ------------ | ----- |',
      '| 品川〜名古屋 | 90 分 |',
      '| 東京         | 5 分  |'
    ].join('\n')
    expect(squeezeCjkSpacing(src)).toBe(
      [
        '| 区間         | 所要 |',
        '| ------------ | ---- |',
        '| 品川〜名古屋 | 90分 |',
        '| 東京         | 5分  |'
      ].join('\n')
    )
  })

  it('セル数が揃っていない表は組み直さない（読み違いの可能性がある）', () => {
    const src = ['| a | b |', '| c |'].join('\n')
    expect(squeezeCjkSpacing(src)).toBe(src)
  })

  it('空文字と非文字列はそのまま返す', () => {
    expect(squeezeCjkSpacing('')).toBe('')
    expect(squeezeCjkSpacing(undefined)).toBe(undefined)
  })
})

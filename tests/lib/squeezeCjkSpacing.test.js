// prettier の markdown 整形は日本語と英数字の境目に半角スペースを差し込む。
// 整形するたびに書いていない空白が増えるので、出力を通してから詰める。
const {
  squeezeCjkSpacing,
  squeezeCjkSpacingWithCursor
} = require('browser/lib/squeezeCjkSpacing')

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

  it('コードフェンスの中の表は組み直さない', () => {
    // 表の書き方を説明したノートや、パイプを含む CLI の出力が書き換わる
    const src = [
      '```',
      '| 区間 | 所要 |',
      '| --- | --- |',
      '| a | b |',
      '```'
    ].join('\n')
    expect(squeezeCjkSpacing(src)).toBe(src)
  })

  it('インデント 4 桁のコードブロックの表は組み直さない', () => {
    // 組み直すとコードブロックが本物の表に変わり、意味が変わる
    const src = ['文章', '', '    | a | b |', '    | - | - |'].join('\n')
    expect(squeezeCjkSpacing(src)).toBe(src)
  })

  it('表の字下げを保つ（リストの中の表が左端に寄らない）', () => {
    const src = [
      '- 項目',
      '',
      '  | 区間 | 所要 |',
      '  | --- | --- |',
      '  | 東京 | 5 分 |'
    ].join('\n')
    expect(squeezeCjkSpacing(src)).toBe(
      [
        '- 項目',
        '',
        '  | 区間 | 所要 |',
        '  | ---- | ---- |',
        '  | 東京 | 5分  |'
      ].join('\n')
    )
  })

  it('寄せ指定のある区切り行も他の列と同じ幅にする', () => {
    const src = ['| a | b |', '| :-: | --: |', '| c | d |'].join('\n')
    expect(squeezeCjkSpacing(src)).toBe(
      ['| a   | b   |', '| :-: | --: |', '| c   | d   |'].join('\n')
    )
  })

  it('閉じていないバッククォートで、行の残りが詰まらなくならない', () => {
    // code span として扱うと、その行の以降がずっと詰まらず、整形のたびに
    // 空白が増え続ける
    expect(squeezeCjkSpacing('値段は 100 円 ` で 200 円')).toBe(
      '値段は100円 ` で200円'
    )
  })

  it('空文字と非文字列はそのまま返す', () => {
    expect(squeezeCjkSpacing('')).toBe('')
    expect(squeezeCjkSpacing(undefined)).toBe(undefined)
  })
})

describe('squeezeCjkSpacingWithCursor', () => {
  it('詰めただけの行はカーソルを同じ文字の位置に置く', () => {
    const src = '西新井から 9 月 7 日に出発します。'
    const r = squeezeCjkSpacingWithCursor(src, src.length)
    expect(r.text).toBe('西新井から9月7日に出発します。')
    expect(r.cursorOffset).toBe(r.text.length)
  })

  it('表を組み直してもカーソルが本文の外へ出ない', () => {
    // カーソルより下の行が列幅を決めるので、カーソルより前だけを詰めて
    // 長さを測る方法では位置がずれる
    const src = [
      '| 区間 | 所要 |',
      '| ---- | ---- |',
      '| 東京 | 5 分 |',
      '| とても長いセル | 10 分 |'
    ].join('\n')
    const r = squeezeCjkSpacingWithCursor(src, 5)
    expect(r.cursorOffset).toBeGreaterThanOrEqual(0)
    expect(r.cursorOffset).toBeLessThanOrEqual(r.text.length)
  })

  it('先頭と末尾を渡しても範囲から出ない', () => {
    const src = '9 月 7 日\n次の行 1 行目'
    expect(squeezeCjkSpacingWithCursor(src, 0).cursorOffset).toBe(0)
    const last = squeezeCjkSpacingWithCursor(src, src.length)
    expect(last.cursorOffset).toBe(last.text.length)
  })
})

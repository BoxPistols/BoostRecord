// 差分の塊分けと、採用した塊だけの反映
const { buildHunks, applyHunks, countChanges } = require('browser/lib/textDiff')

describe('buildHunks / applyHunks', () => {
  const before = [
    '# 題',
    '',
    '古い一文。',
    '残す一文。',
    '消える一文。',
    ''
  ].join('\n')
  const after = [
    '# 題',
    '',
    '新しい一文。',
    '残す一文。',
    '',
    '足した一文。'
  ].join('\n')

  it('連続する削除と追加を 1 つの塊にし、id を振る', () => {
    const hunks = buildHunks(before, after)
    const changes = hunks.filter(h => h.type === 'change')
    expect(countChanges(hunks)).toBe(2)
    expect(changes[0]).toEqual({
      type: 'change',
      id: 0,
      removed: ['古い一文。'],
      added: ['新しい一文。']
    })
    expect(changes[1].removed).toEqual(['消える一文。'])
    // 空行の位置も変わっているので、空行は変更の一部として塊に入る
    expect(changes[1].added).toEqual(['', '足した一文。'])
  })

  it('全部採用すると after、全部不採用だと before に戻る', () => {
    const hunks = buildHunks(before, after)
    expect(applyHunks(hunks, [0, 1], after)).toBe(after)
    expect(applyHunks(hunks, [], before)).toBe(before)
  })

  it('一部だけ採用できる', () => {
    const hunks = buildHunks(before, after)
    const text = applyHunks(hunks, new Set([0]), before)
    expect(text).toBe(
      ['# 題', '', '新しい一文。', '残す一文。', '消える一文。', ''].join('\n')
    )
  })

  it('同じ文章なら変更の塊は 0', () => {
    expect(countChanges(buildHunks('a\nb', 'a\nb'))).toBe(0)
  })
})

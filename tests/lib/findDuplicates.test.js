/**
 * @fileoverview browser/lib/findDuplicatesのテスト
 */
import {
  findExactDuplicates,
  parseSemanticGroups,
  normalizeLine
} from 'browser/lib/findDuplicates'

test('箇条書きの記号と空白の違いは同じ行とみなす', () => {
  expect(normalizeLine('- 開始時期は11月頃を想定')).toBe(
    '開始時期は11月頃を想定'
  )
  expect(normalizeLine('・開始時期は11月頃を想定')).toBe(
    '開始時期は11月頃を想定'
  )
  expect(normalizeLine('1. 開始時期は  11月頃を想定')).toBe(
    '開始時期は 11月頃を想定'
  )
})

test('同じ中身の行を挙げ、箇所は本文の文字位置で返す', () => {
  const text = [
    '## 条件',
    '- 稼働形態はオンライン中心',
    '- 報酬は応相談とする',
    '',
    '## メモ',
    '・稼働形態はオンライン中心',
    '別の行'
  ].join('\n')
  const groups = findExactDuplicates(text)
  expect(groups).toHaveLength(1)
  const occ = groups[0].occurrences
  expect(occ.map(o => o.line)).toEqual([1, 5])
  expect(text.slice(occ[0].start, occ[0].end)).toBe(
    '- 稼働形態はオンライン中心'
  )
  expect(text.slice(occ[1].start, occ[1].end)).toBe(
    '・稼働形態はオンライン中心'
  )
})

test('続けて重なる行はひとまとまりにする', () => {
  const block = [
    '事業仮説をもとにした画面イメージ',
    'ユーザー検証用のデモ画面作成'
  ]
  const text = block
    .concat(['', '間の段落です。ここは違う', ''])
    .concat(block)
    .join('\n')
  const groups = findExactDuplicates(text)
  expect(groups).toHaveLength(1)
  expect(groups[0].text).toBe(block.join('\n'))
  // 0-1行目と、空行・段落・空行を挟んだ5-6行目
  expect(groups[0].occurrences.map(o => o.line)).toEqual([0, 5])
})

test('短い行、区切り線、コードブロックの中は数えない', () => {
  const text = [
    '以上',
    '以上',
    '---',
    '---',
    '```',
    'const value = compute()',
    'const value = compute()',
    '```'
  ].join('\n')
  expect(findExactDuplicates(text)).toEqual([])
})

test('意味の重複は本文にある引用だけを残し、2か所未満の組は出さない', () => {
  const text =
    '開始は11月頃です。\n稼働は応相談です。\n11月ごろから始める予定です。'
  const content = JSON.stringify({
    groups: [
      {
        reason: '開始時期が2回書かれている',
        quotes: ['開始は11月頃です。', '11月ごろから始める予定です。']
      },
      {
        reason: '作り話の引用を含む',
        quotes: ['稼働は応相談です。', '本文に無い文']
      }
    ]
  })
  const { parsed, groups } = parseSemanticGroups(content, text, [])
  expect(parsed).toBe(true)
  expect(groups).toHaveLength(1)
  expect(groups[0].reason).toBe('開始時期が2回書かれている')
  expect(groups[0].occurrences.map(o => o.line)).toEqual([0, 2])
})

test('完全一致で挙げた組と同じものは意味の重複に重ねない', () => {
  const text = '- 稼働形態はオンライン中心\n- 稼働形態はオンライン中心'
  const exact = findExactDuplicates(text)
  const content =
    '```json\n{"groups":[{"reason":"同じ","quotes":["稼働形態はオンライン中心"]}]}\n```'
  expect(parseSemanticGroups(content, text, exact).groups).toEqual([])
})

test('読めない応答はparsed=false', () => {
  expect(parseSemanticGroups('ありません', 'x', []).parsed).toBe(false)
  expect(parseSemanticGroups('{"groups": 1}', 'x', []).parsed).toBe(false)
})

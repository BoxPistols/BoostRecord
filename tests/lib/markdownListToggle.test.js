// 複数行の一括リスト化。境界条件（インデント・空行・種別の入れ替え・
// 番号の振り直し・一部だけ付いている状態）を固定する。
const {
  UL,
  OL,
  TASK,
  toggleLines,
  toggleText,
  stripMarker,
  hasMarker
} = require('browser/lib/markdownListToggle')

describe('付与', () => {
  it('箇条書きにする', () => {
    expect(toggleLines(['a', 'b'], UL)).toEqual(['- a', '- b'])
  })

  it('番号付きは 1 から振り直す', () => {
    expect(toggleLines(['a', 'b', 'c'], OL)).toEqual(['1. a', '2. b', '3. c'])
  })

  it('チェックリストにする', () => {
    expect(toggleLines(['a', 'b'], TASK)).toEqual(['- [ ] a', '- [ ] b'])
  })

  it('インデントを保つ', () => {
    expect(toggleLines(['  a', '\tb'], UL)).toEqual(['  - a', '\t- b'])
    expect(toggleLines(['  a', '  b'], OL)).toEqual(['  1. a', '  2. b'])
  })
})

describe('解除', () => {
  it('全部その種別なら外す', () => {
    expect(toggleLines(['- a', '- b'], UL)).toEqual(['a', 'b'])
    expect(toggleLines(['1. a', '2. b'], OL)).toEqual(['a', 'b'])
    expect(toggleLines(['- [ ] a', '- [x] b'], TASK)).toEqual(['a', 'b'])
  })

  it('一部だけ付いている時は解除ではなく全部に付ける', () => {
    expect(toggleLines(['- a', 'b'], UL)).toEqual(['- a', '- b'])
    expect(toggleLines(['1. a', 'b'], OL)).toEqual(['1. a', '2. b'])
  })

  it('解除してもインデントは残す', () => {
    expect(toggleLines(['  - a'], UL)).toEqual(['  a'])
  })
})

describe('種別の入れ替え', () => {
  it('箇条書き → 番号付き', () => {
    expect(toggleLines(['- a', '- b'], OL)).toEqual(['1. a', '2. b'])
  })

  it('番号付き → チェックリスト', () => {
    expect(toggleLines(['1. a', '2. b'], TASK)).toEqual(['- [ ] a', '- [ ] b'])
  })

  it('チェックリスト → 箇条書き（完了状態は落ちる）', () => {
    expect(toggleLines(['- [x] a', '- [ ] b'], UL)).toEqual(['- a', '- b'])
  })

  it('チェックリストを箇条書き扱いしない（押して解除にならない）', () => {
    // - [ ] は - に前方一致するので、素朴に判定すると「全部箇条書き」と
    // 誤判定して解除されてしまう
    expect(hasMarker('- [ ] a', UL)).toBe(false)
    expect(hasMarker('- [ ] a', TASK)).toBe(true)
  })

  it('* や + や 1) 形式も既存リストとして外せる', () => {
    expect(toggleLines(['* a', '+ b'], OL)).toEqual(['1. a', '2. b'])
    expect(toggleLines(['1) a'], UL)).toEqual(['- a'])
  })
})

describe('空行', () => {
  it('空行には付けない（記号だけの行を作らない）', () => {
    expect(toggleLines(['a', '', 'b'], UL)).toEqual(['- a', '', '- b'])
  })

  it('空行は番号を消費しない', () => {
    expect(toggleLines(['a', '', 'b'], OL)).toEqual(['1. a', '', '2. b'])
  })

  it('選択が空行だけならそこに付ける（書き始めたいはず）', () => {
    expect(toggleLines([''], UL)).toEqual(['- '])
  })
})

describe('toggleText', () => {
  it('複数行テキストをそのまま扱える', () => {
    expect(toggleText('a\nb', UL)).toBe('- a\n- b')
  })

  it('末尾の改行を保つ（行が増えない）', () => {
    expect(toggleText('a\nb\n', UL)).toBe('- a\n- b\n')
  })

  it('文字列でなければそのまま返す', () => {
    expect(toggleText(undefined, UL)).toBeUndefined()
  })
})

describe('stripMarker', () => {
  it('種別を問わず記号だけ外す', () => {
    expect(stripMarker('- [x] a')).toBe('a')
    expect(stripMarker('12. a')).toBe('a')
    expect(stripMarker('  * a')).toBe('  a')
    expect(stripMarker('plain')).toBe('plain')
  })
})

describe('対象外', () => {
  it('未知の種別・空配列は何もしない', () => {
    expect(toggleLines(['a'], 'nope')).toEqual(['a'])
    expect(toggleLines([], UL)).toEqual([])
  })
})

describe('toggleListInEditor', () => {
  const { toggleListInEditor } = require('browser/lib/markdownListToggle')

  function fakeCm(text, sel) {
    const lines = text.split('\n')
    return {
      lines,
      replaced: null,
      selection: null,
      listSelections: () => [sel],
      getLine: i => lines[i],
      replaceRange(str, from, to) {
        this.replaced = { str, from, to }
      },
      setSelection(from, to) {
        this.selection = { from, to }
      }
    }
  }

  it('選択が覆う行だけを書き換える', () => {
    const cm = fakeCm('head\na\nb\ntail', {
      anchor: { line: 1, ch: 0 },
      head: { line: 2, ch: 1 }
    })
    toggleListInEditor(cm, UL)
    expect(cm.replaced.str).toBe('- a\n- b')
    expect(cm.replaced.from).toEqual({ line: 1, ch: 0 })
    expect(cm.replaced.to).toEqual({ line: 2, ch: 1 })
  })

  it('選択の向きが逆でも同じ結果', () => {
    const cm = fakeCm('a\nb', {
      anchor: { line: 1, ch: 1 },
      head: { line: 0, ch: 0 }
    })
    toggleListInEditor(cm, OL)
    expect(cm.replaced.str).toBe('1. a\n2. b')
  })

  it('書き換え後も同じ範囲を選び直す', () => {
    const cm = fakeCm('a', {
      anchor: { line: 0, ch: 0 },
      head: { line: 0, ch: 1 }
    })
    toggleListInEditor(cm, TASK)
    expect(cm.selection).toEqual({
      from: { line: 0, ch: 0 },
      to: { line: 0, ch: '- [ ] a'.length }
    })
  })

  it('変化が無ければ書き換えない（undo に空の1手を積まない）', () => {
    const cm = fakeCm('a', {
      anchor: { line: 0, ch: 0 },
      head: { line: 0, ch: 1 }
    })
    toggleListInEditor(cm, 'nope')
    expect(cm.replaced).toBeNull()
  })

  it('cm が無くても投げない', () => {
    expect(() => toggleListInEditor(null, UL)).not.toThrow()
    expect(() => toggleListInEditor({}, UL)).not.toThrow()
  })
})

// エディタ側の検索・置換。位置がずれると**本文を壊す**ので、
// 「後ろから置換する」規則をここで固定する。
const {
  markMatches,
  clearMarks,
  revealHit,
  replaceHit,
  replaceAllHits
} = require('browser/lib/editorFind')

/**
 * CodeMirror の最小の身代わり。位置(pos)は index をそのまま持つので、
 * 実装が posFromIndex を「置換のたびに取り直している」かどうかがそのまま出る。
 */
function createCm(text) {
  const cm = {
    value: text,
    marks: [],
    selection: null,
    scrolled: 0,
    operations: 0,
    getValue: () => cm.value,
    posFromIndex: index => ({ index }),
    markText: (from, to, opts) => {
      const mark = {
        from: from.index,
        to: to.index,
        className: opts && opts.className,
        cleared: false,
        clear() {
          this.cleared = true
        }
      }
      cm.marks.push(mark)
      return mark
    },
    replaceRange: (str, from, to) => {
      cm.value = cm.value.slice(0, from.index) + str + cm.value.slice(to.index)
    },
    setSelection: (from, to) => {
      cm.selection = [from.index, to.index]
    },
    scrollIntoView: () => {
      cm.scrolled += 1
    },
    operation: fn => {
      cm.operations += 1
      fn()
    }
  }
  return cm
}

describe('markMatches', () => {
  it('一致箇所ぶんだけ印を付ける', () => {
    const cm = createCm('needle x needle')
    const { hits, marks } = markMatches(cm, 'needle')
    expect(hits).toEqual([
      { start: 0, end: 6 },
      { start: 9, end: 15 }
    ])
    expect(marks).toHaveLength(2)
    expect(cm.marks[0].className).toBe('tb-find-all')
  })

  it('空クエリでは1つも印を付けない', () => {
    const cm = createCm('needle')
    expect(markMatches(cm, '').hits).toEqual([])
    expect(cm.marks).toHaveLength(0)
  })

  it('cm が無くても落ちない', () => {
    expect(markMatches(null, 'x')).toEqual({ hits: [], marks: [] })
  })
})

describe('clearMarks', () => {
  it('渡された印をすべて消す', () => {
    const cm = createCm('a a a')
    const { marks } = markMatches(cm, 'a')
    clearMarks(marks)
    expect(cm.marks.every(mark => mark.cleared)).toBe(true)
  })

  it('null を渡しても落ちない（未検索でも呼べる）', () => {
    expect(() => clearMarks(null)).not.toThrow()
  })
})

describe('revealHit', () => {
  it('選択して画面内へ入れる。本文は変えない', () => {
    const cm = createCm('needle x needle')
    revealHit(cm, { start: 9, end: 15 })
    expect(cm.selection).toEqual([9, 15])
    expect(cm.scrolled).toBe(1)
    expect(cm.value).toBe('needle x needle')
  })

  it('該当が無ければ何もしない', () => {
    const cm = createCm('abc')
    expect(revealHit(cm, undefined)).toBe(false)
    expect(cm.selection).toBeNull()
  })
})

describe('replaceHit', () => {
  it('その1件だけを置き換える', () => {
    const cm = createCm('cat dog cat')
    replaceHit(cm, { start: 8, end: 11 }, 'fox')
    expect(cm.value).toBe('cat dog fox')
  })

  it('空文字で置き換える＝削除', () => {
    const cm = createCm('a-b')
    replaceHit(cm, { start: 1, end: 2 }, '')
    expect(cm.value).toBe('ab')
  })
})

describe('replaceAllHits', () => {
  it('置換後に短くなっても後続の位置がずれない', () => {
    // 前から当てると 'x cax' になる（2件目が2文字ぶん左へずれるため）
    const cm = createCm('cat cat')
    const { hits } = markMatches(cm, 'cat')
    expect(replaceAllHits(cm, hits, 'x')).toBe(2)
    expect(cm.value).toBe('x x')
  })

  it('置換後に長くなっても後続の位置がずれない', () => {
    const cm = createCm('a b a')
    const { hits } = markMatches(cm, 'a')
    replaceAllHits(cm, hits, 'AAA')
    expect(cm.value).toBe('AAA b AAA')
  })

  it('まとめて1操作にする（取り消しが1回で済む）', () => {
    const cm = createCm('a a a')
    const { hits } = markMatches(cm, 'a')
    replaceAllHits(cm, hits, 'b')
    expect(cm.operations).toBe(1)
  })

  it('一致0件なら本文に触れない', () => {
    const cm = createCm('abc')
    expect(replaceAllHits(cm, [], 'x')).toBe(0)
    expect(cm.value).toBe('abc')
  })
})

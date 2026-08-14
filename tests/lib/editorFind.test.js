// エディタ側の検索・置換。位置がずれると**本文を壊す**ので、
// 「後ろから置換する」規則をここで固定する。
const {
  markMatches,
  clearMarks,
  revealHit,
  replaceHit,
  replaceAllHits,
  rangeOfMark
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
    indexFromPos: pos => pos.index,
    markText: (from, to, opts) => {
      const mark = {
        from: from.index,
        to: to.index,
        className: opts && opts.className,
        cleared: false,
        clear() {
          this.cleared = true
        },
        // CodeMirror と同じ契約: 消えていたら undefined を返す
        find() {
          if (this.cleared || this.from == null) return undefined
          return { from: { index: this.from }, to: { index: this.to } }
        }
      }
      cm.marks.push(mark)
      return mark
    },
    // 本文が変わったらマークを動かす。CodeMirror の挙動を最小限まねる:
    // 置換範囲に重なったマークは消え、後ろのマークは差分だけずれる
    replaceRange: (str, from, to) => {
      const start = from.index
      const end = to.index
      cm.value = cm.value.slice(0, start) + str + cm.value.slice(end)
      const delta = str.length - (end - start)
      cm.marks.forEach(mark => {
        if (mark.cleared || mark.from == null) return
        if (mark.to <= start) return
        if (mark.from >= end) {
          mark.from += delta
          mark.to += delta
          return
        }
        mark.from = null
        mark.to = null
      })
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
    const { marks } = markMatches(cm, 'needle')
    revealHit(cm, marks[1])
    expect(cm.selection).toEqual([9, 15])
    expect(cm.scrolled).toBe(1)
    expect(cm.value).toBe('needle x needle')
  })

  it('該当が無ければ何もしない', () => {
    const cm = createCm('abc')
    expect(revealHit(cm, undefined)).toBe(false)
    expect(cm.selection).toBeNull()
  })

  it('印が消えていれば何もしない（消えた場所へ飛ばない）', () => {
    const cm = createCm('needle')
    const { marks } = markMatches(cm, 'needle')
    marks[0].clear()
    expect(revealHit(cm, marks[0])).toBe(false)
  })
})

describe('rangeOfMark', () => {
  it('編集で位置がずれても、今の位置を返す', () => {
    const cm = createCm('0123456789 cat')
    const { marks } = markMatches(cm, 'cat')
    expect(rangeOfMark(marks[0])).toEqual({
      from: { index: 11 },
      to: { index: 14 }
    })
    cm.replaceRange('', { index: 0 }, { index: 5 })
    expect(rangeOfMark(marks[0])).toEqual({
      from: { index: 6 },
      to: { index: 9 }
    })
  })

  it('消えた印は null', () => {
    const cm = createCm('cat')
    const { marks } = markMatches(cm, 'cat')
    cm.replaceRange('bird', { index: 0 }, { index: 3 })
    expect(rangeOfMark(marks[0])).toBeNull()
  })
})

describe('replaceHit', () => {
  it('その1件だけを置き換える', () => {
    const cm = createCm('cat dog cat')
    const { marks } = markMatches(cm, 'cat')
    replaceHit(cm, marks[1], 'fox')
    expect(cm.value).toBe('cat dog fox')
  })

  it('空文字で置き換える＝削除', () => {
    const cm = createCm('a-b')
    const { marks } = markMatches(cm, '-')
    replaceHit(cm, marks[0], '')
    expect(cm.value).toBe('ab')
  })

  it('**検索後に前を編集しても、正しい箇所を置換する**', () => {
    const cm = createCm('0123456789 cat')
    const { marks } = markMatches(cm, 'cat')
    cm.replaceRange('', { index: 0 }, { index: 5 })
    replaceHit(cm, marks[0], 'fox')
    expect(cm.value).toBe('56789 fox')
  })

  it('印が消えていれば本文に触れない', () => {
    const cm = createCm('cat dog')
    const { marks } = markMatches(cm, 'cat')
    cm.replaceRange('bird', { index: 0 }, { index: 3 })
    expect(replaceHit(cm, marks[0], 'fox')).toBe(false)
    expect(cm.value).toBe('bird dog')
  })
})

describe('replaceAllHits', () => {
  it('置換後に短くなっても後続の位置がずれない', () => {
    const cm = createCm('cat cat')
    const { marks } = markMatches(cm, 'cat')
    expect(replaceAllHits(cm, marks, 'x')).toBe(2)
    expect(cm.value).toBe('x x')
  })

  it('置換後に長くなっても後続の位置がずれない', () => {
    const cm = createCm('a b a')
    const { marks } = markMatches(cm, 'a')
    replaceAllHits(cm, marks, 'AAA')
    expect(cm.value).toBe('AAA b AAA')
  })

  it('まとめて1操作にする（取り消しが1回で済む）', () => {
    const cm = createCm('a a a')
    const { marks } = markMatches(cm, 'a')
    cm.operations = 0
    replaceAllHits(cm, marks, 'b')
    expect(cm.operations).toBe(1)
  })

  it('一致0件なら本文に触れない', () => {
    const cm = createCm('abc')
    expect(replaceAllHits(cm, [], 'x')).toBe(0)
    expect(cm.value).toBe('abc')
  })

  it('消えた印は数えない', () => {
    const cm = createCm('cat cat')
    const { marks } = markMatches(cm, 'cat')
    marks[0].clear()
    expect(replaceAllHits(cm, marks, 'x')).toBe(1)
    expect(cm.value).toBe('cat x')
  })
})

describe('markMatches はまとめて印を付ける', () => {
  it('1回の operation で済ませる（打鍵のたびに走るため）', () => {
    const cm = createCm('a a a a a')
    markMatches(cm, 'a')
    expect(cm.operations).toBe(1)
  })
})

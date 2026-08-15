// ノート内検索・置換の状態機械。Markdown ノートとスニペットノートが
// **同じ実装を共有する**ことが前提なので、ここが仕様書になる。
const FindController = require('browser/lib/findController')

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

function createController(text, target) {
  const cm = createCm(text)
  const seen = []
  const controller = new FindController({
    getCm: () => cm,
    // プレビューは持たない構成（DOM を要求しないでテストする）
    getPreviewDoc: () => null,
    getTarget: () => target || 'EDITOR',
    onChange: state => seen.push(state)
  })
  return { cm, controller, seen }
}

describe('開閉', () => {
  it('開くと入力欄用の初期状態を配る', () => {
    const { controller, seen } = createController('needle')
    controller.open()
    expect(seen[0]).toEqual({
      query: '',
      index: -1,
      count: 0,
      focusToken: 1,
      replacement: '',
      showReplace: false
    })
  })

  it('開いたまま開き直すと focusToken だけ進む（入力を打ち直せる）', () => {
    const { controller } = createController('needle needle')
    controller.open()
    controller.search('needle')
    controller.open()
    expect(controller.state.query).toBe('needle')
    expect(controller.state.count).toBe(2)
    expect(controller.state.focusToken).toBe(2)
  })

  it('閉じると null を配り、印を消す', () => {
    const { cm, controller } = createController('needle needle')
    controller.open()
    controller.search('needle')
    controller.close()
    expect(controller.state).toBeNull()
    expect(cm.marks.every(mark => mark.cleared)).toBe(true)
  })
})

describe('探す', () => {
  it('件数を数えるが**現在地は動かさない**', () => {
    const { cm, controller } = createController('needle x needle')
    controller.open()
    controller.search('needle')
    expect(controller.state.count).toBe(2)
    expect(controller.state.index).toBe(-1)
    expect(cm.selection).toBeNull()
  })

  it('打ち直して件数が減ったら現在地を丸める', () => {
    const { controller } = createController('aa ab')
    controller.open()
    controller.search('a')
    controller.step(1)
    controller.step(1)
    controller.step(1) // index 2（3件目）
    expect(controller.state.index).toBe(2)
    controller.search('ab')
    expect(controller.state.count).toBe(1)
    expect(controller.state.index).toBe(0)
  })

  it('0件なら現在地は未選択に戻る', () => {
    const { controller } = createController('abc')
    controller.open()
    controller.search('zzz')
    expect(controller.state).toMatchObject({ count: 0, index: -1 })
  })

  it('探し直すと前の印は残らない', () => {
    const { cm, controller } = createController('a a a')
    controller.open()
    controller.search('a')
    const first = cm.marks.slice()
    controller.search('a')
    expect(first.every(mark => mark.cleared)).toBe(true)
  })
})

describe('現在地の移動', () => {
  it('Enter 相当で次の一致を選ぶ', () => {
    const { cm, controller } = createController('needle x needle')
    controller.open()
    controller.search('needle')
    controller.step(1)
    expect(controller.state.index).toBe(0)
    expect(cm.selection).toEqual([0, 6])
    controller.step(1)
    expect(cm.selection).toEqual([9, 15])
  })

  it('端は反対側へ回り込む', () => {
    const { controller } = createController('a a')
    controller.open()
    controller.search('a')
    controller.step(-1)
    expect(controller.state.index).toBe(1)
  })

  it('0件なら何もしない', () => {
    const { cm, controller } = createController('abc')
    controller.open()
    controller.search('zzz')
    controller.step(1)
    expect(cm.selection).toBeNull()
  })

  // 全一致の背景は選択範囲を覆うので、選択だけでは現在地が見えない。
  // 「今どれを見ているか」は印で示す。**常に1つだけ**が不変条件
  const activeMarks = cm =>
    cm.marks.filter(m => !m.cleared && m.className === 'tb-find-active')

  it('現在地には別の印を付ける', () => {
    const { cm, controller } = createController('needle x needle')
    controller.open()
    controller.search('needle')
    expect(activeMarks(cm)).toHaveLength(0)
    controller.step(1)
    expect(activeMarks(cm)).toHaveLength(1)
    expect(activeMarks(cm)[0].from).toBe(0)
  })

  it('移動すると前の現在地の印は消える', () => {
    const { cm, controller } = createController('needle x needle')
    controller.open()
    controller.search('needle')
    controller.step(1)
    controller.step(1)
    expect(activeMarks(cm)).toHaveLength(1)
    expect(activeMarks(cm)[0].from).toBe(9)
  })

  it('閉じると現在地の印も残らない', () => {
    const { cm, controller } = createController('needle x needle')
    controller.open()
    controller.search('needle')
    controller.step(1)
    controller.close()
    expect(activeMarks(cm)).toHaveLength(0)
  })

  it('置換して数え直しても現在地の印は1つだけ', () => {
    const { cm, controller } = createController('needle x needle')
    controller.open()
    controller.search('needle')
    controller.step(1)
    controller.setReplacement('pin')
    controller.replace()
    expect(activeMarks(cm)).toHaveLength(1)
  })
})

describe('置換', () => {
  it('現在地を1件だけ置換し、次の一致へ進む', () => {
    const { cm, controller } = createController('cat cat cat')
    controller.open()
    controller.search('cat')
    controller.setReplacement('fox')
    controller.step(1) // 1件目を選択
    controller.replace()
    expect(cm.value).toBe('fox cat cat')
    expect(controller.state.count).toBe(2)
    // 置換した箇所は一致から消えるので、同じ添字が「次の一致」になる
    expect(controller.state.index).toBe(0)
    expect(cm.selection).toEqual([4, 7])
  })

  it('現在地が未選択なら先頭を置換する（押して無反応にしない）', () => {
    const { cm, controller } = createController('cat cat')
    controller.open()
    controller.search('cat')
    controller.setReplacement('fox')
    controller.replace()
    expect(cm.value).toBe('fox cat')
  })

  it('最後の1件を置換したら未選択に戻る', () => {
    const { controller } = createController('cat')
    controller.open()
    controller.search('cat')
    controller.setReplacement('fox')
    controller.replace()
    expect(controller.state).toMatchObject({ count: 0, index: -1 })
  })

  it('すべて置換する', () => {
    const { cm, controller } = createController('cat dog cat')
    controller.open()
    controller.search('cat')
    controller.setReplacement('fox')
    controller.replaceAll()
    expect(cm.value).toBe('fox dog fox')
    expect(controller.state).toMatchObject({ count: 0, index: -1 })
  })

  it('置換後の文字列が検索語を含むなら件数は 0 にならない', () => {
    const { cm, controller } = createController('a a')
    controller.open()
    controller.search('a')
    controller.setReplacement('aa')
    controller.replaceAll()
    expect(cm.value).toBe('aa aa')
    expect(controller.state.count).toBe(4)
  })

  it('置換文字列が空なら削除になる', () => {
    const { cm, controller } = createController('a-b-c')
    controller.open()
    controller.search('-')
    controller.replaceAll()
    expect(cm.value).toBe('abc')
  })

  it('一致0件なら本文に触れない', () => {
    const { cm, controller } = createController('abc')
    controller.open()
    controller.search('zzz')
    controller.setReplacement('x')
    controller.replace()
    controller.replaceAll()
    expect(cm.value).toBe('abc')
  })
})

describe('プレビューを探している間', () => {
  it('置換は出さない（読むだけの面なので押せても何も起きない）', () => {
    const { controller } = createController('cat', 'PREVIEW')
    expect(controller.canReplace()).toBe(false)
  })

  it('置換を呼ばれても本文を書き換えない', () => {
    const { cm, controller } = createController('cat', 'PREVIEW')
    controller.open()
    // プレビューの document を持たない構成なので件数は 0 のまま
    controller.search('cat')
    controller.setReplacement('fox')
    controller.replace()
    controller.replaceAll()
    expect(cm.value).toBe('cat')
  })
})

describe('置換欄の開閉', () => {
  it('トグルできる。開いていない時は何も配らない', () => {
    const { controller, seen } = createController('a')
    controller.toggleReplace()
    expect(seen).toHaveLength(0)
    controller.open()
    controller.toggleReplace()
    expect(controller.state.showReplace).toBe(true)
    controller.toggleReplace()
    expect(controller.state.showReplace).toBe(false)
  })
})

describe('本文が変わった後（データ破壊の防止）', () => {
  it('**検索後に前の方を編集しても、置換は正しい箇所に当たる**', () => {
    // 数値のオフセットで位置を持っていると、ここで無関係な文字を壊す
    const { cm, controller } = createController('0123456789 cat')
    controller.open()
    controller.search('cat')
    expect(controller.state.count).toBe(1)
    // 先頭の 5 文字を消す（一致箇所より前を編集）
    cm.replaceRange('', { index: 0 }, { index: 5 })
    expect(cm.value).toBe('56789 cat')
    controller.setReplacement('fox')
    controller.replace()
    expect(cm.value).toBe('56789 fox')
  })

  it('一致箇所そのものが編集で消えたら、置換は本文に触れない', () => {
    const { cm, controller } = createController('cat dog')
    controller.open()
    controller.search('cat')
    cm.replaceRange('bird', { index: 0 }, { index: 3 })
    expect(cm.value).toBe('bird dog')
    controller.setReplacement('fox')
    controller.replace()
    expect(cm.value).toBe('bird dog')
    expect(controller.state.count).toBe(0)
  })

  it('refresh() で件数を数え直す', () => {
    const { cm, controller } = createController('cat')
    controller.open()
    controller.search('cat')
    expect(controller.state.count).toBe(1)
    cm.replaceRange(' cat cat', { index: 3 }, { index: 3 })
    controller.refresh()
    expect(controller.state.count).toBe(3)
  })

  it('閉じている間は refresh() で何も配らない', () => {
    const { controller, seen } = createController('cat')
    controller.refresh()
    expect(seen).toHaveLength(0)
  })
})

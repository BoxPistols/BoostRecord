// エディタ（CodeMirror 6）側のノート内検索。一致を装飾で塗り、現在地を選択して見える位置へ送る。
// 本文は書き換えない。置換だけが本文を変える
import { EditorSelection, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import type { Match } from './findInText'

const setMarks = StateEffect.define<{ matches: Match[]; active: number }>()

const allMark = Decoration.mark({ class: 'cm-find-match' })
const activeMark = Decoration.mark({ class: 'cm-find-match cm-find-active' })

/** MarkdownEditor の拡張に入れておく。入力しても塗りは本文に合わせて動く */
export const findMarks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(setMarks)) continue
      const { matches, active } = e.value
      marks = Decoration.set(
        matches.map((m, i) =>
          (i === active ? activeMark : allMark).range(m.start, m.end)
        )
      )
    }
    return marks
  },
  provide: f => EditorView.decorations.from(f)
})

/**
 * 塗り直す。scroll のときだけ現在地を選択して画面内へ送る
 * （入力のたびに送ると、IME の変換中に画面が飛ぶ）
 */
export function showMatches(
  view: EditorView,
  matches: Match[],
  active: number,
  scroll: boolean
) {
  const len = view.state.doc.length
  // 本文が先に変わっていたら範囲外になりうる。範囲外は落とす
  const safe = matches.filter(m => m.end <= len)
  const target = scroll ? safe[active] : undefined
  view.dispatch({
    effects: [
      setMarks.of({ matches: safe, active }),
      ...(target ? [EditorView.scrollIntoView(target.start, { y: 'center' })] : [])
    ],
    ...(target ? { selection: EditorSelection.single(target.start, target.end) } : {})
  })
}

export function clearMatches(view: EditorView) {
  view.dispatch({ effects: setMarks.of({ matches: [], active: -1 }) })
}

/** 一致をまとめて置き換える。後ろから当てる必要は無い（changes は元の位置で解釈される） */
export function replaceMatches(view: EditorView, matches: Match[], text: string) {
  const len = view.state.doc.length
  view.dispatch({
    changes: matches
      .filter(m => m.end <= len)
      .map(m => ({ from: m.start, to: m.end, insert: text }))
  })
}

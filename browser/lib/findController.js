// ノート内検索・置換の状態機械。
//
// 「どこを探すか」（エディタの CodeMirror / プレビューの iframe）は画面ごとに
// 違うが、**探し方・数え方・現在地の進め方・置換の後始末は全く同じ**なので、
// 差分だけを host に渡してここへ集約する。Markdown ノートとスニペットノートで
// 別実装にすると、片方だけ直す事故が起きる（実際 Cmd+F はスニペット側に
// 受け口が無く、v0.21.0 以降まったく効かなかった）。
//
// DOM も React も知らない。host が返すものだけを触る。
import { stepIndex } from 'browser/lib/findInText'
import * as editorFind from 'browser/lib/editorFind'
import * as previewFind from 'browser/lib/findInPreview'

// 開いた直後の状態。index は -1（未選択）。**入力しても index は動かない**
const INITIAL = {
  query: '',
  index: -1,
  count: 0,
  focusToken: 0,
  replacement: '',
  showReplace: false
}

export default class FindController {
  /**
   * @param {object} host
   * @param {function(): object|null} host.getCm アクティブな CodeMirror
   * @param {function(): Document|null} host.getPreviewDoc プレビューの document
   * @param {function(): string} host.getTarget 'EDITOR' | 'PREVIEW'
   * @param {function(object|null): void} host.onChange 表示用 state を渡す
   */
  constructor(host) {
    this.host = host
    this.state = null
    this.hits = []
    this.marks = []
    // 置換で本文が変わると change が飛び、refresh() が再入する。
    // 走っている間は降りる
    this.busy = false
    this.previewDoc = null
    this.previewRanges = null
    // 現在地の印。全一致の印とは別に持つ（重ねて付けて、動くたびに消す）
    this.activeMark = null
  }

  /** 現在地の印を消す。未設定でも呼べる */
  clearActive() {
    if (this.activeMark) this.activeMark.clear()
    this.activeMark = null
  }

  isOpen() {
    return this.state != null
  }

  /** 置換はエディタでしか意味を持たない（プレビューは読むだけの面） */
  canReplace() {
    return this.host.getTarget() !== 'PREVIEW'
  }

  emit(next) {
    this.state = next
    this.host.onChange(next)
  }

  /** 開く。既に開いていれば入力欄を選び直すだけ（打ち直せる） */
  open() {
    const prev = this.state
    this.emit(
      Object.assign({}, INITIAL, prev, {
        focusToken: ((prev && prev.focusToken) || 0) + 1
      })
    )
  }

  close() {
    this.clear()
    this.emit(null)
  }

  /**
   * ハイライトを全部消す。エディタ・プレビューの両方を対象にする。
   * プレビューは **印を付けた時の document** を覚えて消す。host に今の
   * document を聞くと、タブを切り替えた後は別のタブを指していて、
   * 前のタブに印が残る
   */
  clear() {
    this.clearActive()
    editorFind.clearMarks(this.marks)
    this.marks = []
    this.hits = []
    const doc = this.previewDoc || this.host.getPreviewDoc()
    if (doc) previewFind.clear(doc)
    this.previewDoc = null
    this.previewRanges = null
  }

  /**
   * 探すだけ。**現在地は絶対に動かさない**（IME 変換中に画面が飛ぶため）。
   * @returns {number} 一致件数
   */
  search(query) {
    this.clear()
    let count = 0
    if (this.host.getTarget() === 'PREVIEW') {
      const doc = this.host.getPreviewDoc()
      if (doc) {
        const result = previewFind.search(doc, query)
        this.previewDoc = doc
        this.previewRanges = result.ranges
        count = result.count
      }
    } else {
      const marked = editorFind.markMatches(this.host.getCm(), query)
      this.hits = marked.hits
      this.marks = marked.marks
      count = marked.marks.length
    }

    const prev = this.state || INITIAL
    this.emit(
      Object.assign({}, prev, {
        query,
        count,
        // 件数が変わったら現在地は無効。ただし勝手に進めない
        index: count === 0 ? -1 : Math.min(prev.index, count - 1)
      })
    )
    return count
  }

  /** 現在地を動かす。**Enter / ボタンからしか呼ばない** */
  step(direction) {
    const prev = this.state
    if (!prev || !prev.count) return
    const index = stepIndex(prev.index, prev.count, direction)
    this.reveal(index)
    this.emit(Object.assign({}, prev, { index }))
  }

  reveal(index) {
    if (index < 0) return
    if (this.host.getTarget() === 'PREVIEW') {
      const doc = this.previewDoc || this.host.getPreviewDoc()
      if (doc) previewFind.setActive(doc, this.previewRanges, index)
    } else {
      const cm = this.host.getCm()
      this.clearActive()
      if (editorFind.revealHit(cm, this.marks[index])) {
        this.activeMark = editorFind.markActive(cm, this.marks[index])
      }
    }
  }

  /**
   * 本文が変わった時に呼ぶ。開いていなければ何もしない。
   * 置換そのものも本文を変えるので、二重に走らないよう印で守る
   */
  refresh() {
    if (!this.state || this.busy) return
    if (this.host.getTarget() === 'PREVIEW') return
    this.rescan(this.state.index)
  }

  toggleReplace() {
    if (!this.state) return
    this.emit(
      Object.assign({}, this.state, { showReplace: !this.state.showReplace })
    )
  }

  setReplacement(replacement) {
    if (!this.state) return
    this.emit(Object.assign({}, this.state, { replacement }))
  }

  /**
   * 現在地を1件だけ置換する。現在地が未選択なら先頭を置換する
   * （押したのに何も起きない、を作らない）
   */
  replace() {
    const prev = this.state
    if (!prev || !prev.count || !this.canReplace()) return
    const cm = this.host.getCm()
    const at = prev.index < 0 ? 0 : prev.index
    const mark = this.marks[at]
    if (!cm || !mark) return
    // マークが消えていれば（その箇所が編集で失われていれば）何もしない。
    // 数値のオフセットで持っていると、ここで無関係な文字を書き換える
    if (!editorFind.replaceHit(cm, mark, prev.replacement)) {
      this.rescan(at)
      return
    }
    // 置換した箇所は一致から消えるので、同じ添字に「次の一致」が来る
    this.rescan(at)
  }

  replaceAll() {
    const prev = this.state
    if (!prev || !prev.count || !this.canReplace()) return
    const cm = this.host.getCm()
    if (!cm) return
    editorFind.replaceAllHits(cm, this.marks, prev.replacement)
    this.rescan(-1)
  }

  /**
   * 本文が変わった後に探し直す。
   * 置換後の文字列が検索語を含むこと（a → aa 等）もあるので、0 件を前提にしない
   * @param {number} at 現在地に置きたい添字。-1 なら未選択に戻す
   */
  rescan(at) {
    const prev = this.state || INITIAL
    this.busy = true
    const cm = this.host.getCm()
    // 現在地の印も一緒に捨てる。残すと置換後の別の位置に色が残る
    this.clearActive()
    editorFind.clearMarks(this.marks)
    const marked = editorFind.markMatches(cm, prev.query)
    this.hits = marked.hits
    this.marks = marked.marks
    const count = marked.marks.length
    const index = count === 0 || at < 0 ? -1 : Math.min(at, count - 1)
    if (index >= 0) this.reveal(index)
    this.busy = false
    this.emit(Object.assign({}, prev, { count, index }))
  }
}

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
    this.marks = null
    this.previewDoc = null
    this.previewRanges = null
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
    editorFind.clearMarks(this.marks)
    this.marks = null
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
      count = marked.hits.length
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
      editorFind.revealHit(this.host.getCm(), this.hits[index])
    }
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
    const hit = this.hits[at]
    if (!cm || !hit) return
    editorFind.replaceHit(cm, hit, prev.replacement)
    // 置換した箇所は一致から消えるので、同じ添字に「次の一致」が来る
    this.rescan(at)
  }

  replaceAll() {
    const prev = this.state
    if (!prev || !prev.count || !this.canReplace()) return
    const cm = this.host.getCm()
    if (!cm) return
    editorFind.replaceAllHits(cm, this.hits, prev.replacement)
    this.rescan(-1)
  }

  /**
   * 本文が変わった後に探し直す。
   * 置換後の文字列が検索語を含むこと（a → aa 等）もあるので、0 件を前提にしない
   * @param {number} at 現在地に置きたい添字。-1 なら未選択に戻す
   */
  rescan(at) {
    const prev = this.state || INITIAL
    const cm = this.host.getCm()
    editorFind.clearMarks(this.marks)
    const marked = editorFind.markMatches(cm, prev.query)
    this.hits = marked.hits
    this.marks = marked.marks
    const count = marked.hits.length
    const index = count === 0 || at < 0 ? -1 : Math.min(at, count - 1)
    if (index >= 0) editorFind.revealHit(cm, this.hits[index])
    this.emit(Object.assign({}, prev, { count, index }))
  }
}

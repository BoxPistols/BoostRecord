// ノート内検索の状態。デスクトップ版 MarkdownNoteDetail の runFind / handleFindStep /
// handleReplace と同じ決まりで動かす:
//   - 入力・本文の変化・面の切り替えでは「探し直す」だけで、現在地は動かさない
//   - 現在地を進めるのは step（Enter / ボタン）だけ
//   - 置換はエディタのときだけ。現在地が無いまま置換を押したら、置き換えずに最初の一致を選ぶ
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { EditorView } from '@codemirror/view'
import { findMatches, indexAfter, stepIndex } from './findInText'
import type { Match } from './findInText'
import { clearMatches, replaceMatches, showMatches } from './editorFind'
import { clearPreview, searchPreview, setPreviewActive } from './previewFind'

export type FindTarget = 'EDITOR' | 'PREVIEW'

export interface FindState {
  query: string
  index: number
  count: number
  focusToken: number
  replace: string
  replaceOpen: boolean
}

interface Pending {
  scroll: boolean
  /** 置換の後、この位置以降の最初の一致を現在地にする */
  afterOffset?: number
  /** すべて置換の後など、現在地を外す */
  reset?: boolean
}

export function useNoteFind(opts: {
  noteKey: string | null
  content: string
  target: FindTarget
  previewRef: RefObject<HTMLDivElement | null>
}) {
  const { noteKey, content, target, previewRef } = opts
  const [find, setFind] = useState<FindState | null>(null)
  const findRef = useRef(find)
  findRef.current = find
  const view = useRef<EditorView | null>(null)
  // エディタを作り直したら探し直す（検索を開いた後にエディタができた場合も件数を出す）
  const [viewTick, setViewTick] = useState(0)
  const matches = useRef<Match[]>([])
  const ranges = useRef<Range[]>([])
  const pending = useRef<Pending | null>(null)
  const last = useRef<{ query: string; noteKey: string | null; target: FindTarget } | null>(null)

  const open = !!find
  const query = find?.query ?? ''

  // 探し直す。現在地は、語・ノート・面が同じなら引き継ぐ（IME の確定や入力で飛ばない）
  useEffect(() => {
    if (!open) {
      if (view.current) clearMatches(view.current)
      clearPreview()
      matches.current = []
      ranges.current = []
      last.current = null
      return
    }
    const prev = findRef.current
    const same =
      last.current?.query === query &&
      last.current?.noteKey === noteKey &&
      last.current?.target === target
    last.current = { query, noteKey, target }
    const p = pending.current
    pending.current = null

    let count = 0
    if (target === 'EDITOR') {
      clearPreview()
      ranges.current = []
      const v = view.current
      matches.current = v ? findMatches(v.state.doc.toString(), query) : []
      count = matches.current.length
    } else {
      if (view.current) clearMatches(view.current)
      matches.current = []
      ranges.current = searchPreview(previewRef.current, query)
      count = ranges.current.length
    }

    let index: number
    if (count === 0 || p?.reset) index = -1
    else if (p?.afterOffset !== undefined) index = indexAfter(matches.current, p.afterOffset)
    else index = same && prev ? Math.min(prev.index, count - 1) : -1

    paint(index, !!p?.scroll)
    setFind(f => (f && (f.index !== index || f.count !== count) ? { ...f, index, count } : f))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, content, noteKey, target, viewTick])

  function paint(index: number, scroll: boolean) {
    if (target === 'EDITOR') {
      if (view.current) showMatches(view.current, matches.current, index, scroll)
    } else {
      setPreviewActive(previewRef.current, ranges.current, index, scroll)
    }
  }

  const step = (direction: number) => {
    const f = findRef.current
    if (!f || !f.count) return
    const next = stepIndex(f.index, f.count, direction)
    paint(next, true)
    setFind({ ...f, index: next })
  }

  const replace = () => {
    const f = findRef.current
    const v = view.current
    if (!f || !f.count || !v || target !== 'EDITOR') return
    const m = matches.current[f.index]
    // どれが置き換わるのか見えないまま書き換えない
    if (!m) return step(1)
    // 置き換えても本文が変わらないときは、探し直しが走らないので自分で次へ進む
    if (v.state.sliceDoc(m.start, m.end) === f.replace) return step(1)
    pending.current = { scroll: true, afterOffset: m.start + f.replace.length }
    replaceMatches(v, [m], f.replace)
  }

  const replaceAll = () => {
    const f = findRef.current
    const v = view.current
    if (!f || !f.count || !v || target !== 'EDITOR') return
    pending.current = { scroll: false, reset: true }
    replaceMatches(v, matches.current, f.replace)
  }

  const openFind = useCallback(() => {
    setFind(prev => ({
      query: '',
      index: -1,
      count: 0,
      replace: '',
      replaceOpen: false,
      ...prev,
      focusToken: (prev?.focusToken ?? 0) + 1
    }))
  }, [])

  const onView = useCallback((v: EditorView | null) => {
    view.current = v
    if (v) setViewTick(t => t + 1)
  }, [])

  const close = () => {
    setFind(null)
    // 閉じたら本文へ戻す。フォーカスが宙に浮くと次の操作が効かない
    if (target === 'EDITOR') view.current?.focus()
  }

  return {
    find,
    openFind,
    close,
    step,
    replace,
    replaceAll,
    setQuery: (q: string) => setFind(f => (f ? { ...f, query: q } : f)),
    setReplace: (r: string) => setFind(f => (f ? { ...f, replace: r } : f)),
    toggleReplace: () => setFind(f => (f ? { ...f, replaceOpen: !f.replaceOpen } : f)),
    onView
  }
}

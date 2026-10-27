// 画面の割り付け（サイドバー・ノート一覧の開閉と幅、エディタとプレビューの表示）。
// デスクトップ版（browser/main/Main.js・lib/sideNavMode.js・MarkdownSplitEditor.js）と
// 同じ範囲と巡回順にしてある。片方だけ変えると、行き来する利用者が迷う。

export type PaneMode = 'EXPANDED' | 'FOLDED' | 'HIDDEN'
export type ViewMode = 'EDITOR' | 'SPLIT' | 'PREVIEW'

// 並び順がそのまま Cmd+B / Cmd+Shift+B の巡回順
const PANE_MODES: PaneMode[] = ['EXPANDED', 'FOLDED', 'HIDDEN']
const VIEW_MODES: ViewMode[] = ['EDITOR', 'SPLIT', 'PREVIEW']

export const NAV = { min: 80, max: 400, folded: 44, initial: 240 }
export const LIST = {
  min: 120,
  max: 360,
  initial: 300,
  foldedMin: 64,
  foldedMax: 200,
  foldedInitial: 100
}
// エディタの幅（%）。どちらかが見えなくなるところまでは寄せない
export const SPLIT = { min: 10, max: 90, initial: 50 }

export interface Layout {
  navMode: PaneMode
  navWidth: number
  listMode: PaneMode
  listWidth: number
  foldedListWidth: number
  viewMode: ViewMode
  editorPercent: number
}

export const DEFAULT_LAYOUT: Layout = {
  navMode: 'EXPANDED',
  navWidth: NAV.initial,
  listMode: 'EXPANDED',
  listWidth: LIST.initial,
  foldedListWidth: LIST.foldedInitial,
  viewMode: 'SPLIT',
  editorPercent: SPLIT.initial
}

/** 未知の値は EXPANDED に戻す（壊れた値から必ず既知の状態へ戻す） */
export function nextPaneMode(mode: PaneMode): PaneMode {
  const i = PANE_MODES.indexOf(mode)
  return i === -1 ? 'EXPANDED' : PANE_MODES[(i + 1) % PANE_MODES.length]
}

export function nextViewMode(mode: ViewMode): ViewMode {
  const i = VIEW_MODES.indexOf(mode)
  return i === -1 ? 'SPLIT' : VIEW_MODES[(i + 1) % VIEW_MODES.length]
}

/**
 * Cmd/Ctrl+E。Split と全面プレビューを行き来する。プレビューを解くときは、
 * 元が全面エディタでも Split に戻す（デスクトップ版と同じ）
 */
export function togglePreview(mode: ViewMode): ViewMode {
  return mode === 'PREVIEW' ? 'SPLIT' : 'PREVIEW'
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** 画面に出すノート一覧の幅。HIDDEN は 0 */
export function listPaneWidth(layout: Layout): number {
  if (layout.listMode === 'HIDDEN') return 0
  return layout.listMode === 'FOLDED' ? layout.foldedListWidth : layout.listWidth
}

/** 画面に出すサイドバーの幅。HIDDEN は 0 */
export function navPaneWidth(layout: Layout): number {
  if (layout.navMode === 'HIDDEN') return 0
  return layout.navMode === 'FOLDED' ? NAV.folded : layout.navWidth
}

/** ノート一覧の境界をドラッグした先の幅。畳んでいるときは畳んだ幅を動かす */
export function resizeList(layout: Layout, width: number): Layout {
  return layout.listMode === 'FOLDED'
    ? { ...layout, foldedListWidth: clamp(width, LIST.foldedMin, LIST.foldedMax) }
    : { ...layout, listWidth: clamp(width, LIST.min, LIST.max) }
}

/** 保存値を読む。足りない・壊れた値は既定値で埋める */
export function parseLayout(raw: string | null): Layout {
  let v: Partial<Record<keyof Layout, unknown>> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') v = parsed as typeof v
  } catch {
    // 壊れていれば既定値
  }
  const pane = (m: unknown): PaneMode =>
    PANE_MODES.includes(m as PaneMode) ? (m as PaneMode) : 'EXPANDED'
  const num = (n: unknown, min: number, max: number, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) ? clamp(n, min, max) : fallback
  return {
    navMode: pane(v.navMode),
    navWidth: num(v.navWidth, NAV.min, NAV.max, NAV.initial),
    listMode: pane(v.listMode),
    listWidth: num(v.listWidth, LIST.min, LIST.max, LIST.initial),
    foldedListWidth: num(
      v.foldedListWidth,
      LIST.foldedMin,
      LIST.foldedMax,
      LIST.foldedInitial
    ),
    viewMode: VIEW_MODES.includes(v.viewMode as ViewMode)
      ? (v.viewMode as ViewMode)
      : 'SPLIT',
    editorPercent: num(v.editorPercent, SPLIT.min, SPLIT.max, SPLIT.initial)
  }
}

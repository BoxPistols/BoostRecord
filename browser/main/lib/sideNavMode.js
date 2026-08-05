// サイドバーの表示モード。Cmd+B は EXPANDED → FOLDED → HIDDEN → … と回す。
//
// 以前は isSideNavFolded という boolean の2状態だった。3値へ広げるが、
// 既存の設定ファイルには sideNavMode が無く、参照箇所も boolean を見ている
// ものが残るので、両方を必ず同時に更新する（isSideNavFolded は
// 「EXPANDED ではない」の意味で導出する）。
//
// electron を require しないので単体テストできる。

export const EXPANDED = 'EXPANDED'
export const FOLDED = 'FOLDED'
export const HIDDEN = 'HIDDEN'

// 並び順がそのまま Cmd+B の巡回順
export const SIDE_NAV_MODES = [EXPANDED, FOLDED, HIDDEN]

export function isValidSideNavMode(mode) {
  return SIDE_NAV_MODES.indexOf(mode) !== -1
}

/**
 * 次のモード。未知の値は EXPANDED の次（＝FOLDED）ではなく EXPANDED に
 * 戻す（壊れた値から必ず既知の状態へ復帰させる）。
 */
export function nextSideNavMode(mode) {
  const i = SIDE_NAV_MODES.indexOf(mode)
  if (i === -1) return EXPANDED
  return SIDE_NAV_MODES[(i + 1) % SIDE_NAV_MODES.length]
}

/**
 * 保存済み設定から現在のモードを決める。
 *
 * sideNavMode があればそれを使う。無い（＝この機能より前に保存された設定）
 * なら旧 boolean から導く。ここで既定へ倒すと、畳んで使っていた人の状態が
 * 更新のたびに戻る。
 *
 * @param {object} stored localStorage から読んだ生の config
 * @returns {string}
 */
export function resolveSideNavMode(stored) {
  if (!stored || typeof stored !== 'object') return EXPANDED
  if (isValidSideNavMode(stored.sideNavMode)) return stored.sideNavMode
  return stored.isSideNavFolded ? FOLDED : EXPANDED
}

// 旧 boolean を見ている箇所のための導出値。
// HIDDEN も「展開されていない」なので true（見落としがあっても
// 展開扱いで幅を取ってしまう事故にはならない）
export function isFoldedFor(mode) {
  return mode !== EXPANDED
}

export function isHiddenFor(mode) {
  return mode === HIDDEN
}

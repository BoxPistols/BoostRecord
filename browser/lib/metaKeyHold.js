/**
 * @fileoverview 修飾キー（Mac は Cmd、それ以外は Ctrl）の「押しっぱなし」検出。
 *
 * keydown は押している間リピートし続けるので、そのまま setState に流すと
 * 毎フレーム再描画になる。ここで状態変化した時だけ購読者へ通知する。
 *
 * ウィンドウがフォーカスを失うと keyup が届かず「押しっぱなし」のまま
 * 固まるため、blur / visibilitychange / ページ離脱でも必ず解除する。
 */

const isMac = /Mac|iPhone|iPad|iPod/.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : ''
)

const listeners = new Set()
let held = false
let attached = false

function emit(next) {
  if (next === held) return
  held = next
  listeners.forEach(fn => {
    try {
      fn(held)
    } catch (e) {
      console.error('metaKeyHold listener failed', e)
    }
  })
}

// 修飾キーそのものが押されたかを見る。他のキーと一緒に押した場合も
// e.metaKey / e.ctrlKey で拾えるので、両方を条件にする
function isModifier(e) {
  return isMac
    ? e.key === 'Meta' || e.metaKey
    : e.key === 'Control' || e.ctrlKey
}

function handleKeyDown(e) {
  if (e.repeat) return
  if (isModifier(e)) emit(true)
}

function handleKeyUp(e) {
  if (!isMac && (e.key === 'Control' || !e.ctrlKey)) return emit(false)
  if (isMac && (e.key === 'Meta' || !e.metaKey)) return emit(false)
}

function release() {
  emit(false)
}

function attach() {
  if (attached || typeof window === 'undefined') return
  attached = true
  window.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('keyup', handleKeyUp, true)
  window.addEventListener('blur', release)
  document.addEventListener('visibilitychange', release)
}

/**
 * 押しっぱなし状態の変化を購読する。
 * @param {Function} listener (held: boolean) => void
 * @returns {Function} 解除用の関数
 */
export function subscribe(listener) {
  attach()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 現在押されているか（購読せず単発で見たい時用） */
export function isHeld() {
  return held
}

/**
 * イベントが「修飾キー + 1〜9」かを判定し、1〜9 を返す。該当しなければ null。
 * e.key は US 配列以外で記号になり得るので keyCode（49〜57）で見る。
 */
export function getJumpNumber(e) {
  if (!(isMac ? e.metaKey : e.ctrlKey)) return null
  if (e.shiftKey || e.altKey) return null
  if (e.keyCode < 49 || e.keyCode > 57) return null
  return e.keyCode - 48
}

export const MAX_JUMP_TARGETS = 9

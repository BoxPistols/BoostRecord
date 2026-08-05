// 起動時に「最後に見ていたページ」を開くための保存・復元。
//
// 保存先は localStorage の専用キー。config に混ぜないのは、壊れた値が
// 混入した時に設定全体の検証を巻き込みたくないため（config は validate() が
// 落ちると初期値へ巻き戻る）。
//
// 復元は必ず既知のルート形だけに絞る。保存済みの経路は「消したノート」や
// 「解除したストレージ」を指していることがあり、素通しすると起動直後に
// 空白の画面へ落ちる。判定に外れたら /home へ倒す。

const STORAGE_KEY = 'lastRoute'
export const FALLBACK_ROUTE = '/home'

// browser/main/index.js の <Switch> にあるものだけを許可する。
// ここに無い形は復元しない（増やす時は両方を揃える）
const ALLOWED_EXACT = [
  '/home',
  '/starred',
  '/bookmarked',
  '/trashed',
  '/alltags'
]
const ALLOWED_PREFIX = ['/tags/', '/searched', '/storages/']

/**
 * 復元してよいルートかどうか。
 * @param {string} route pathname + search
 * @returns {boolean}
 */
// 制御文字は正規表現に直接書くと no-control-regex に触れるので、
// コードポイントで判定する（\s は別途 regex で見る）
function hasControlChar(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || c === 0x7f) return true
  }
  return false
}

export function isRestorableRoute(route) {
  if (typeof route !== 'string' || route.charAt(0) !== '/') return false
  // 改行や制御文字が混じった値は壊れているとみなす
  if (/\s/.test(route) || hasControlChar(route)) return false
  if (route.length > 2048) return false
  const path = route.split('?')[0]
  if (ALLOWED_EXACT.indexOf(path) !== -1) return true
  return ALLOWED_PREFIX.some(prefix => path.indexOf(prefix) === 0)
}

/**
 * location を保存する。復元できない形は保存もしない（次回の起動で
 * 判定に外れて捨てるくらいなら、最初から残さない方が分かりやすい）。
 * 例外は投げない（保存の失敗で画面遷移を壊さない）。
 *
 * @param {{pathname: string, search?: string}} location
 */
export function saveLastRoute(location) {
  try {
    if (!location || typeof location.pathname !== 'string') return
    const route = `${location.pathname}${location.search || ''}`
    if (!isRestorableRoute(route)) return
    window.localStorage.setItem(STORAGE_KEY, route)
  } catch (e) {
    // localStorage が使えない環境でも起動は続ける
  }
}

/**
 * 起動時に開くルート。保存が無い / 壊れている / 未知の形なら /home。
 * @returns {string}
 */
export function readLastRoute() {
  try {
    const route = window.localStorage.getItem(STORAGE_KEY)
    return isRestorableRoute(route) ? route : FALLBACK_ROUTE
  } catch (e) {
    return FALLBACK_ROUTE
  }
}

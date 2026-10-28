// ブラウザでの保存先。既定はブラウザの中（OPFS）で、開いてすぐ書ける。
// PC のフォルダ（File System Access）は Chrome・Edge で選んだ人だけが使う。
// フォルダを選ぶまで 1 件も書けない形だと、試しに開いた人が何もできない
const STORAGE_MODE = 'boostrecord.storageMode'
export type StorageMode = 'browser' | 'folder'

export function getStorageMode(): StorageMode {
  try {
    return localStorage.getItem(STORAGE_MODE) === 'folder' ? 'folder' : 'browser'
  } catch {
    return 'browser'
  }
}

/** 切り替えは読み込み直してから効く（保存先ごとにノートを読み直すため） */
export function setStorageMode(mode: StorageMode) {
  try {
    localStorage.setItem(STORAGE_MODE, mode)
  } catch {
    // 保存できなければ切り替えない
  }
}

/** どの保存先を使うか。フォルダは選んだときだけ。OPFS が無ければフォルダ、どちらも無ければ見本 */
export function chooseBrowserStorage(env: {
  fsa: boolean
  opfs: boolean
  mode: StorageMode
}): 'folder' | 'browser' | 'memory' {
  if (env.fsa && (env.mode === 'folder' || !env.opfs)) return 'folder'
  if (env.opfs) return 'browser'
  return 'memory'
}

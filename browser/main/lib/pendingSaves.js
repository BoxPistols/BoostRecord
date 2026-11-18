// 保存がまだ済んでいない編集を、ノートの編集画面から集めておく。
// アプリ内更新で開き直す前に、書きかけを失わないかを確かめるのに使う
// （lib/app-updater.jsが'update-restart-query'で聞いてくる）。
// 編集画面は1秒の遅延で保存するので、その間と書き込みの最中、書き込みに失敗した後を
// 「保存していない」とみなす
const sources = new Set()

// sourceは{ isDirty(): boolean, flush(): Promise }。戻り値で登録を外す
export function registerPendingSave(source) {
  sources.add(source)
  return () => sources.delete(source)
}

export function hasPendingSave() {
  return Array.from(sources).some(s => s.isDirty())
}

// 保留中の保存をすぐ書き込む。失敗しても投げず、後でhasPendingSaveが確かめる
export function flushPendingSaves() {
  return Promise.all(
    Array.from(sources).map(s => Promise.resolve(s.flush()).catch(() => {}))
  )
}

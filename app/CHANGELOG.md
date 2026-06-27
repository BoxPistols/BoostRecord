# The Boosters — 変更履歴

[Boostnote Legacy](https://github.com/BoxPistols/Boostnote) を母体とするモダン版ノートアプリ（Vite + React 19 + TypeScript + CodeMirror 6 / Electron 42）の変更履歴です。

## 0.1.2

ノート管理とプレビューを実用レベルまで拡充。

### 追加
- **ストレージフォルダピッカー**: アプリ内から実 `.cson` ストレージ（`boostnote.json` のあるフォルダ）を選択・永続化して読み込み。
- **ノート CRUD**: 新規作成（⌘/Ctrl+N）・編集の書き戻し保存（オートセーブ）・ゴミ箱（移動/復元/完全削除）。
- **整理**: タグの付与/削除、フォルダ間の移動。
- **全文検索**: タイトル/本文/タグを AND 絞り込み（⌘/Ctrl+F）。
- **一覧ソート**: 更新日 / 作成日 / タイトル × 昇順・降順（localStorage に永続化）。
- **プレビュー強化**: KaTeX による数式（`$…$` / `$$…$$`）、highlight.js によるコードのシンタックスハイライト。

### 安全性 / 品質
- 書き戻しはアトミック書き込み＋編集可能フィールドのみ上書きで未知メタデータを温存。key／path のサニタイズでトラバーサルを遮断。
- プレビューは `html:false` ＋ DOMPurify。KaTeX / highlight.js の出力がサニタイズで壊れないことを happy-dom で実測。
- ユニットテスト 2 → 36 件、lint 警告ゼロ。

## 0.1.1

- アプリ名を **The Boosters** に変更（廃盤となった Boostnote へのリスペクトを残しつつ別ブランドへ）。
- macOS universal（dmg / zip）＋ Windows（nsis）配布ビルドを GitHub Releases に公開。
- 未署名のため macOS 初回起動は `xattr -dr com.apple.quarantine` が必要（README 参照）。

## 0.1.0

- モダンアプリの初期土台。3 ペイン UX（サイドバー / 一覧 / エディタ＋プレビュー）、実 `.cson` の読込（環境変数指定）、仮想化リスト、electron-builder による初回パッケージング。

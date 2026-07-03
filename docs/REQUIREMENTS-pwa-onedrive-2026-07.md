# 要件定義 / 詳細定義 — 最新 Win/Mac + PWA(iPhone) + OneDrive ストレージ（2026-07-03）

対象: The Boosters（Boostnote Legacy を in-place モダナイズしたプロダクト）
決定: iPhone は 軽量 PWA コンパニオン方式（Option C） で進める。

---

## 0. 背景と結論

ユーザー要求は「最新 Windows/Mac 対応 + PWA(iPhone Safari) + Storage は OneDrive 経由」。
実測（browser/ 157 ファイル中 55=35% が Node/Electron 依存、データ層は純 fs+CSON）から、
これは 難易度の違う 3 層 に分けて完遂する:

| 要求 | 判定 | 難易度 |
|---|---|---|
| 最新 Win/Mac ネイティブ | ほぼ完了（Electron 28 + electron-builder） | 低 |
| OneDrive（デスクトップ） | 実質 0 工数（storage.path に同期フォルダ指定） | 極低 |
| OneDrive（iPhone から） | 要新規実装（Microsoft Graph API） | 中〜高 |
| PWA（iPhone Safari） | 要新規実装（renderer は Electron 前提） | 高 |

採用アーキテクチャ（Option C）: レガシー Electron は無改修で OneDrive 同期フォルダを使う。
iPhone 用にはレガシー renderer を移植せず、同じ .cson／添付フォーマットを Graph API で
read/write する独立した軽量 PWA コンパニオンを新規に建てる（閲覧＋markdown 軽編集）。

---

## 1. 現状のデータ層（実測・変更しない前提の一次情報）

- 1 ノート = 1 .cson ファイル: {storagePath}/notes/{key}.cson
  - 作成 browser/main/lib/dataApi/createNote.js:90-91、更新 updateNote.js:142-143、一覧 resolveStorageNotes.js:6-26
  - key はファイル名由来（ファイル内には保存しない: createNote.js:92 の omit で key/storage を除去）
- ストレージ索引: {storagePath}/boostnote.json（中身は CSON、folders と version）
  - resolveStorageData.js:15-25、addStorage.js:73、init.js:61
- ストレージ定義 key/name/type/path/isOpen（addStorage.js:36-42、type 既定 FILESYSTEM）
  - レジストリはレンダラの localStorage キー storages に永続（addStorage.js:56 / init.js:28）
  - パスは任意フォルダをユーザーが選択（StoragesTab.js:16-30 ネイティブ dialog.showOpenDialog）
- 添付: {storagePath}/attachments/{noteKey}/{filename}（attachmentManagement.js:14,206-212）
  - 本文参照は :storage/{noteKey}/{file} プレースホルダ（STORAGE_FOLDER_PLACEHOLDER, :13,329）
  - 描画時に file:///{storagePath}/attachments/... に書換（:297-311）
- クラウド同期コードは皆無（純ローカル fs）。boostnote.io 参照は別売クラウドへのマーケ導線のみ。

## 2. PWA 移植性（実測）

- 表示層（React16/Redux/styl の JSX、store.js の Redux）: portable
- 設定/Preferences: needs-shim（コアは localStorage、electron-config/ipcRenderer を剥がす）
- path のみ使用 28 ファイル: needs-shim（path-browserify）
- データ層 dataApi/*（約34 ファイル）: needs-rewrite（fs+CSON+絶対パス。呼び出し側と関数シグネチャは維持可、本体だけ差替）
- 添付 / コンテキストメニュー / エクスポート・PDF / ネイティブダイアログ / メインウィンドウ制御: needs-rewrite
- AI（browser/main/lib/aiAssist.js + lib/ai/*）: needs-shim（ipcRenderer.invoke/on を fetch/SSE に付替。キーは Safari に配れない → backend 必須）
- webpack は NodeTargetPlugin（Node ターゲット、polyfill 無し）、nodeIntegration:true、PWA インフラ無し

→ 表示層は流用可だが永続化は全て fs/Electron main に着地。丸ごと移植は過剰。だから Option C。

---

## 3. 要件定義

### 機能要件
| ID | 要件 |
|---|---|
| F-1 | デスクトップ(Win/Mac)で storage を OneDrive 同期フォルダに置き自動同期 |
| F-2 | iPhone Safari から PWA インストール（ホーム画面追加）・オフライン起動 |
| F-3 | PWA が Microsoft アカウントでログインし同一 OneDrive 上の .cson を一覧・閲覧 |
| F-4 | PWA で markdown ノートの新規/編集/保存、デスクトップと相互反映 |
| F-5 | 添付画像を PWA で表示（:storage → Graph ダウンロード URL 解決） |
| F-6 | 競合時にデータを失わない（last-write-wins + 競合コピー保持） |
| F-7（任意） | PWA で AI 執筆支援（要 backend プロキシ。無ければモバイル無効化） |

### 非機能要件
- 対応: Windows 11 / macOS 14+（Electron 28）、iOS Safari 16.4+
- オフライン: PWA はローカルキャッシュ（IndexedDB/OPFS）、復帰時同期
- iOS 制約: ホーム画面追加を促す + navigator.storage.persist()。File System Access API 非対応前提
- セキュリティ: OAuth トークンはメモリ/secure storage。API キーはブラウザバンドルに含めない
- 単一ユーザー・複数端末前提（多人数同時編集は対象外＝別トラック Yjs）

---

## 4. 詳細定義（Option C）

### 1. デスクトップ側（レガシー Electron・ほぼ無改修）
- storage を OneDrive 配下へ（docs/ONEDRIVE-DESKTOP-SETUP.md 参照）
- （任意・小改修）初回起動ヘルパで OneDrive パス自動検出:
  - Windows: env OneDrive / OneDriveConsumer / OneDriveCommercial
  - macOS: ~/Library/CloudStorage/OneDrive-* または ~/OneDrive
- デスクトップと PWA が同一サブツリー（例 Apps/Boostnote/）を使う規約を固定

### 2. PWA コンパニオン（新規 pwa/・Vite + React + TS）
| モジュール | 実装 |
|---|---|
| 認証 | @azure/msal-browser（OAuth2 PKCE）、Graph scope Files.ReadWrite |
| ストレージアダプタ | Graph REST（fetch）: /me/drive/root:/Apps/Boostnote/notes/{key}.cson:/content の GET/PUT、一覧は :/children、差分は delta |
| CSON | @rokt33r/season 相当をブラウザバンドル（.cson 双方向） |
| ローカルキャッシュ | IndexedDB（idb）にミラー、フォアグラウンドで差分同期 |
| エディタ | v1 は textarea + markdown プレビュー、v2 で CodeMirror 6 |
| 添付 | Graph で attachments/{noteKey}/* 取得、:storage を blob URL 解決 |
| 競合 | Graph eTag/cTag で検出、LWW + keep-both |
| PWA シェル | manifest + service worker、HTTPS ホスティング |
| AI（任意） | キー保持のサーバレスプロキシに fetch/SSE。無ければモバイル無効 |

### 人手ブロッカー（コードで埋められない）
1. Microsoft Entra（Azure AD）アプリ登録 — client id / redirect URI / Graph 権限 Files.ReadWrite
2. PWA の HTTPS ホスティング選定（Vercel / Netlify / GitHub Pages）
3. CSON ブラウザ動作の実検証 / 添付バイナリの Graph 取り扱い / 競合ポリシー確定

---

## 5. ロードマップ & 概算工数

| フェーズ | 内容 | 概算 |
|---|---|---|
| P0（即） | Win/Mac 出荷 + OneDrive 同期フォルダ運用のドキュメント化 | 〜1日 |
| P1 | Entra 登録 + PWA 骨組み（MSAL 認証 + Graph でノート一覧/閲覧 read-only） | 約1週 |
| P2 | PWA 編集・保存・添付・オフラインキャッシュ・競合処理 | 約2〜3週 |
| P3（任意） | AI プロキシ backend、署名/notarize、将来 Option B 収束検討 | +1〜2週 |

### 参考: 不採用案
- Option A（最速・iPhone 非対応）: Win/Mac + OneDrive 同期フォルダのみ。1日未満だが PWA 未達。
- Option B（本命収束・大型）: モダン app/ を Electron+PWA 単一コードで Graph 対応。2〜3ヶ月。iPhone が主編集面になったら収束先。

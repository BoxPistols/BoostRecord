# The Boosters — 残タスク / 次の一手（2026-06-30 時点）

直近（OS App化 → AI 連携）を踏まえた未完了事項。各項目は独立着手可能。

## 完了済み（参考）
- **OS App化**: 本体を electron-builder 化（"The Boosters" / `io.boxpistols.theboosters` / `asar:false` / mac dmg+zip arm64+x64 / win nsis / 未署名）。arm64 dmg は実機動作確認済み。**PR #83**（main ← `modernize/electron-42`、CI 緑）。`app/` は "The Boosters Next"（別 appId / タグ `app-v*`）。
- **CI**: `ci.yml` を pnpm + Node 22 化。`release-legacy.yml`（タグ `v*` で mac+win ビルド・Release 公開）。
- **AI 執筆支援の土台**: 右クリック「AI」サブメニュー（要約/書き換え/翻訳/続き/コード説明）。**OpenAI + Gemini** マルチプロバイダ（Claude 不使用）。main プロセス service + IPC ストリーム。コミット `ca4a01f6`（**未 push**）。

## A. AI 執筆支援（継続）
- [ ] **Preferences「AI」タブ**: provider 選択（OpenAI/Gemini）＋各キー入力＋モデル入力＋有効化。`browser/main/modals/PreferencesModal/` に `AITab.js` を追加し `index.js` の tabs / renderContent / state に登録。保存は `ConfigManager.set({ ai: {...} })`（`set` は `ai` を丸ごと置換するので完全な ai オブジェクトを渡す）。
- [ ] **モデル ID の生存確認**: 既定 `gpt-5-mini` / `gemini-2.5-flash`。保存時 or 起動時に OpenAI `/v1/models`・Gemini ListModels で生存 ID を裏取り（モデル名は頻繁に変わる）。
- [ ] **ストリーム挿入 UX**: ローディング表示・キャンセル・エラー時ロールバック。現状は `lib/ai` 経由で CM5 へ素朴に差分挿入。
- [ ] **トークン/usage 表示（任意）**: OpenAI は `stream_options:{include_usage:true}` で最終 chunk に usage。Gemini は `usageMetadata`。IPC done で返す。
- [ ] **キー検証**: Preferences 入力キーの空/typo を正規表現で早期検出。

## B. 読み上げ TTS（新規）
- [ ] **VOICEVOX（ローカル）**: ★ HTTPS ブラウザから `http://localhost:50021` は mixed-content/CORS で死ぬが、**Electron main(Node) から叩けば回避**。`/audio_query` → `/synthesis` の2段（query JSON → wav 合成）。engine 同梱は `vv-engine/run` を bundle。
- [ ] **Grok voice（xAI）**: `api.x.ai`。main プロセスから直 fetch/SDK（プロキシ不要）。
- peer `machining-fundamentals`（`/Users/ai/dev/Asagiri/Metal/machining-fundamentals`）に両方の知見あり（claude-peers で相談可）。

## C. 配信 / リリース

### リリースフロー（現状）
- **配信トリガーはタグ push のみ**。main へのマージでは配信されない
  ```bash
  git tag v0.16.5 && git push origin v0.16.5
  ```
  → `release-legacy.yml` が起動し、macOS arm64/x64 dmg + Windows exe を CI ビルドして GitHub Releases に公開

- **アプリ内アップデート通知（v0.16.4 実装済み）**: 起動時に GitHub API で最新タグを取得、現行バージョンより新しければダイアログ表示 → Releases ページをブラウザで開く。手動 DL フロー。

### 残タスク
- [ ] **公開前スモーク**: AI 依存（`openai` / `@google/genai`）追加後にパッケージ再検証していない。`pnpm run dist:dir` → 起動スモークで同梱起動を最終確認（リスク低）。
- [ ] **コード署名 / notarize → ワンクリック自動インストール化**:
  - 現状: 未署名の ad-hoc ビルド。通知はあるが自動インストール不可
  - 目標: Apple Developer ID（$99/年）+ Windows 証明書を取得し、GitHub Secrets に登録
  - 実装: `release-legacy.yml` に署名ステップを追加、`electron-updater` を有効化すると「今すぐ更新」ワンクリックで自動インストール可能になる
  - mac: `package.json` の `build.mac.identity: null` を解除、`notarize` フック追加
  - win: `build.win.certificateFile` / `CSC_LINK` 環境変数を設定
  - **署名なし環境では `electron-updater` の自動 apply は mac で Gatekeeper に弾かれる**ため、Developer ID 取得が先決

## D. ブランチ / PR 衛生
- [ ] AI コミット `ca4a01f6` は **`modernize/electron-42` にローカルのみ（未 push）**。PR #83（OS App化）に含めるか、別 PR に切り出すか判断。push すれば PR #83 に乗る。

## E. モダナイゼーション本流（別軸 / `boostnote-modernize` スキル参照）
- Yjs CRDT 共同編集（別 peer が backend 調査中）、CM6 / React19 / Vite / Electron42 への段階移行。OS App化・AI は **Electron 28 上で出荷済み**のため、これらは独立トラックで後追い可。

## 設計メモ（再発防止）
- AI 呼び出しは **main プロセス**から（webpack1 がモダン SDK をバンドルしない＋ブラウザ CORS 回避）。
- SDK の API 表面は記憶でなく **node_modules の型定義 / context7 で実物検証**（バージョンで動く）。
- 罠: GPT-5/o1/o3 = `max_completion_tokens`＋temperature 禁止 / Gemini はネイティブ `generateContentStream`＋reasoning buffer(+1200)。
- レート制限/KV/ティアは public web 用 → 単一ユーザーのデスクトップでは作らない（env優先→Preferences 上書きの2段で十分）。

## 拡張プラグイン機構（2026-07-05 追記・今後別途検討）
- ユーザー意向: 拡張プラグインは今後別途検討したい（Obsidian 的な拡張性が新アプリのベンチマーク項目）
- 旧 Boostnote の Plugins タブ/wakatime 連携は 2026-07 に撤去済み。復活ではなくゼロベースで設計する
- 検討タイミング: CM6/React 19 モダナイズ（Phase 2）後。プラグイン API 表面はエディタ層の確定が先

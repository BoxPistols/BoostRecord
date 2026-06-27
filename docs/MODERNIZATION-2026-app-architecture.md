# The Boosters — モダンアプリ As-Built アーキテクチャ

> 対象: `app/`（モダンアプリ本体、リリース v0.1.2 時点）
> 関連: [スタック選定](MODERNIZATION-2026-stack-selection.md) / [共同編集リビジョン](MODERNIZATION-2026-collab-revision.md)
> このドキュメントは「設計判断」ではなく「**実装された結果**」を記録する as-built リファレンスです。

## TL;DR

- **スタック（実装済み）**: Vite + React 19 + TypeScript + CodeMirror 6 + markdown-it + DOMPurify、デスクトップは Electron 42。レガシー本体（Electron 4 / React 16 / webpack 1）とは別ツリー（`app/`）で並走。
- **データ層は 1 本の継ぎ目（`NotesRepository`）に集約**。Electron 実装は実 `.cson` を読み書きし、ブラウザ実装はサンプルデータ。レンダラはどちらかを知らない。
- **セキュリティ既定**: `contextIsolation:true` / `nodeIntegration:false` / `sandbox:true`。レンダラへの公開面は `window.boostnote` の数メソッドのみ（preload の contextBridge）。
- **複数端末同期は「今すぐ」可能**: ストレージフォルダを OneDrive / iCloud Drive / Dropbox の同期フォルダ内に置き、アプリ内ピッカーで開くだけ。リアルタイム共同編集（Yjs + Hocuspocus）は `poc/collab-core/` にある任意のアップグレード。
- **テストは純関数＋結合点に集中**。`node --test` ＋ 型ストリッピング（TS を直接）＋ happy-dom（DOMPurify 結合）。v0.1.2 時点で 47 ケース。

## ディレクトリ構成（`app/`）

```
app/
  electron/
    main.cjs        Electron メイン。BrowserWindow ＋ IPC ハンドラ ＋ config 永続化
    preload.cjs     contextBridge で window.boostnote を最小公開
    loadNotes.cjs   純 Node の .cson 入出力（load/save/create/delete）。Electron 非依存で単体テスト可能
  src/
    App.tsx           画面のオーケストレーション（状態・ハンドラ・3 ペイン）
    components/        Sidebar / NoteList（仮想化）/ MarkdownEditor(CM6) / Preview / TagEditor
    data/             repository（継ぎ目）/ search / sort / tags / exportMarkdown / sampleNotes
    markdown/         highlight（highlight.js サブセット）/ format（整形ショートカット）
    electron.d.ts     window.boostnote の型（preload との契約）
    types.ts          Note / Storage / Folder / Selection
```

## データ層の継ぎ目: `NotesRepository`

レンダラは常に `NotesRepository` インターフェースだけを見る。実体は実行環境で選ぶ:

- **Electron**: `window.boostnote`（preload）越しに IPC を呼び、メインプロセスが実 `.cson` を読み書き。
- **ブラウザ**: in-memory のサンプルデータ（280 件生成）で UI を成立させる土台。

メソッドの多く（`pickStorage` / `saveNote` / `createNote` / `deleteNote` / `exportNote`）は **任意**。ブラウザ実装はこれらを提供しないため、UI 側は `typeof repository.xxx === 'function'` で能力を判定し、該当ボタンを**非表示にして安全に degrade**する。これにより「同じ UI コードがブラウザでもデスクトップでも壊れない」を保証する。

## IPC ブリッジとセキュリティモデル

| チャネル | 役割 |
|---|---|
| `notes:load` | config ＋ `BOOSTNOTE_STORAGE` の全ストレージを読み込む |
| `notes:pickStorage` | フォルダ選択ダイアログ→`boostnote.json` 検証→config に永続化→再読込 |
| `notes:save` | 編集を `.cson` に書き戻す（アトミック） |
| `notes:create` | 空の MARKDOWN ノートを生成 |
| `notes:delete` | `.cson` を完全削除 |
| `notes:export` | 保存ダイアログ経由で `.md` 書き出し |

防御の要点:
- `preload.cjs` は ipcRenderer を直接渡さず、**固定の関数集合だけ**を公開。
- 書き込み系（save/create/delete）は `key` を**サニタイズ**し、`path.dirname(file) === notesDir` を検証して**パストラバーサルを遮断**。
- `saveNote` は編集可能フィールド（title/content/tags/folder/isStarred/isTrashed/updatedAt）**のみ**を上書きし、未知メタデータ（SNIPPET の `snippets` 等）を温存。
- 書き戻しは **temp + rename** のアトミック書き込みで途中失敗による破損を回避。

## プレビューのサニタイズと拡張

`Preview` は markdown-it を `html:false` で使い、出力を **DOMPurify** でサニタイズしてから `replaceChildren`（`innerHTML` 不使用）。拡張は 2 つ:

- **KaTeX**（`@vscode/markdown-it-katex`、`output:'html'`）— `$…$` / `$$…$$`。
- **highlight.js**（core ＋ 言語サブセットを tree-shake）— fenced code。

両拡張とも「サニタイズで出力が壊れないこと」を **happy-dom 上の結合テスト**で実測している（`class="katex"` / `class="hljs…"` の生存）。サニタイザ設定変更による退行を CI で検知できる。

## テスト戦略

- ランナー: `node --test --experimental-strip-types test/*.test.mjs`。**TS ソースを直接** import できる（Node 22.6+ の型ストリッピング）。
- 純関数（search / sort / tags / format / exportMarkdown / loadNotes / saveNote / createNote / deleteNote）を中心に検証。
- DOM が必要なもの（DOMPurify 結合）は **happy-dom** を注入して node 環境で実行。
- v0.1.2 時点 47 ケース、lint（oxlint）警告ゼロ。

## 複数端末同期 — 今できること / 次にできること

**今すぐ（コード追加ゼロ）**: `.cson` ストレージフォルダを **OneDrive / iCloud Drive / Dropbox の同期フォルダ内**に置き、各端末でアプリ内の「ストレージフォルダを開く」から指定する。`.cson` が source of truth でありオフライン完全動作。競合は whole-file（同時編集時にクラウド側で重複ファイル）で、手動解消が前提（[スタック選定](MODERNIZATION-2026-stack-selection.md)の脅威モデル参照）。

**任意のアップグレード（リアルタイム）**: `poc/collab-core/`（Yjs CRDT + y-codemirror.next + self-host Hocuspocus + `.cson` スナップショット書き戻し + device-pairing 認証）を app の `MarkdownEditor` に配線すると、自動・ロスレスな多端末同時編集になる。配線は CM6 のドキュメントを Y.Text に差し替える形で、`MarkdownEditor` の継ぎ目（`noteKey` で再マウントする設計）に収まる。

## 既知の非対応 / 今後

- SNIPPET ノートはエディタ上で単一 Markdown として扱われる（複数フラグメント編集は未対応。`snippets` 配列は保存時に温存）。
- エディタ↔プレビューのスクロール同期は未実装。
- 署名 / 公証は未実施（macOS 初回起動は quarantine 解除が必要、README 参照）。
- リアルタイム共同編集の app 配線（上記 PoC のアップグレード）。

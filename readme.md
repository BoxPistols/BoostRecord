<h1 align="center">The Boosters</h1>

<h4 align="center">プログラマ向けノートアプリ Boostnote Legacy の後継。UI/UX を引き継ぎつつ、リアルタイム共同編集・local-first・拡張性を備えた最新スタックへ。</h4>
<h5 align="center">※ Boostnote はサービス終了済みのため、敬意を込めて「The Boosters」へ改名（GPL-3.0 継承）。</h5>

<p align="center">
  <a href="https://github.com/BoxPistols/Boostnote/actions/workflows/ci.yml">
    <img src="https://github.com/BoxPistols/Boostnote/actions/workflows/ci.yml/badge.svg" alt="Legacy CI" />
  </a>
  <a href="https://github.com/BoxPistols/Boostnote/actions/workflows/modern.yml">
    <img src="https://github.com/BoxPistols/Boostnote/actions/workflows/modern.yml/badge.svg" alt="Modern CI" />
  </a>
</p>

> 本家 Boostnote はサービス終了済みです（後継は [BoostNote-App](https://github.com/BoostIO/BoostNote-App)）。
> 本リポジトリは **BoxPistols による Boostnote Legacy のフォーク**で、ライセンス（GPL-3.0）を継承しつつ、
> リアルタイム共同編集・local-first・拡張性を備えたモダンなノートアプリへ段階的に作り替えています。
> ベンチマーク: Obsidian / HackMD。

## リポジトリ構成

| パス | 内容 | ランタイム |
|---|---|---|
| `browser/`, `lib/` | **レガシー本体**（Electron 4 + React 16 + Redux + webpack 1、`.cson` ファイル保存）。保守モードで安定化中 | Node 14 |
| `app/` | **モダンアプリ土台**（Vite + React 19 + TypeScript + CodeMirror 6）。3ペインUXを再現し、実 `.cson` の読込・新規作成・編集の書き戻し保存（オートセーブ）・タグ編集・フォルダ移動・ゴミ箱（移動/復元/完全削除）・全文検索・一覧ソート（更新/作成/タイトル）・KaTeX 数式プレビュー・コードのシンタックスハイライト・仮想化リスト・フォルダピッカーに対応。Electron 42 で配布 | Node 22 |
| `poc/collab-core/` | **共同編集コアの実証**（Yjs + CodeMirror 6 + self-host Hocuspocus + `.cson` スナップショット、device-pairing 認証） | Node 22 |
| `docs/` | モダナイゼーション設計判断書（スタック選定・脅威モデル・移行ロードマップ、事実検証済み） | — |
| `.claude/skills/boostnote-modernize` | アーキテクチャ判断・作業方針をまとめた Claude Code スキル | — |

## 開発

```bash
# レガシー本体（Node 14 / Volta 推奨）
npm install --legacy-peer-deps
npm run dev        # Electron 4 で起動
npm test           # AVA + Jest
npm run lint       # ESLint

# モダンアプリ（Node 22）
cd app
npm install
npm run dev        # ブラウザ（サンプルデータ）
npm test           # .cson データ層テスト
npm run build      # 型チェック付き本番ビルド
BOOSTNOTE_STORAGE="/path/to/storage" npm run electron  # 実 .cson を読むデスクトップ起動

# 共同編集コア（Node 22）
cd poc/collab-core && npm install && npm test
```

## ダウンロード（配布ビルド）

**[📦 Releases ページ](https://github.com/BoxPistols/Boostnote/releases)** から最新のインストーラを入手できます（macOS `.dmg`/`.zip`・Windows `.exe`）。

リリースは `app-v*` タグの push で GitHub Actions（[release.yml](.github/workflows/release.yml)）が macOS / Windows ランナーでビルドし、自動で Releases に公開します:

```bash
git tag app-v0.1.0 && git push origin app-v0.1.0
```

> ⚠️ 現状の配布ビルドは **未署名**（署名証明書未設定）のため、初回起動時に OS の警告が出ます。
>
> **macOS で「壊れているため開けません」と出る場合**（未署名＋ダウンロード隔離属性が原因）— アプリを `/Applications` 等へ移動してから、ターミナルで隔離属性を外すと起動できます:
> ```bash
> xattr -dr com.apple.quarantine "/Applications/The Boosters.app"
> ```
> **Windows** は SmartScreen の「詳細情報」→「実行」で起動できます。
>
> 恒久対応は **Apple Developer ID / Windows コード署名証明書**を GitHub Secrets に登録 → `release.yml` に配線して、署名・notarize 済み（警告なし）で配布します。

レガシー本家ビルドは [BoostIO/boost-releases](https://github.com/BoostIO/boost-releases/releases/) から入手できます。

## モダナイゼーションの方針（要約）

- **シェル**: Electron を最新サポート版（v42）へ。
- **UI**: React 19 + Redux Toolkit。**現行 UI/UX を踏襲しつつ進化**。
- **エディタ**: CodeMirror 6（source markdown + ライブプレビュー）。
- **同期**: Yjs（CRDT）で **local-first ＋ リアルタイム共同編集**。`.cson` は派生スナップショットとして温存。
- **同期サーバ**: self-host Hocuspocus（平文は自分の VPS、フラットコスト）。共有は自分の複数端末（device-pairing）。
- **優先順位**: まず高速・安定の土台。詳細は [`docs/`](./docs/) を参照。

## ライセンス

[GPL v3](./LICENSE)（BoostIO からの継承）。

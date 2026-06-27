# Boostnote Legacy モダナイゼーション 設計判断書

> 対象: Boostnote Legacy（local-first markdown note app / macOS + Windows desktop）
> 現行: Electron 4.2.12 + React 16.8 + Redux 3.5 + CodeMirror 5 + webpack 1 + Stylus + on-disk `.cson`
> 計測値: 25,238 SLOC（`browser/` 24,366 + `lib/` 872）、components 17、dataApi 35 files、modal/Detail/SideNav/TopBar/StatusBar 44 files（package.json 実測）

## TL;DR

- **Shell / runtime: Electron を維持し、最新サポート版（v42 系）へ in-place で上げる。** Tauri 2 への移行は「renderer をモダン化し終えた後の任意フェーズ」に切り離す（Rust 化に renderer を人質に取らせない）。
- **UI framework: React を維持し 16.8 → 18 → 19 へ。** 既存の React+Redux 資産（editor/preview/snippet 約 3.4k LOC + react-* 依存）の最大再利用が効く唯一の選択。state 層は Redux 3.5 → Redux Toolkit（boy-scout rule で漸進）。
- **Editor core: CodeMirror 6。** CM5 の直系後継で「source markdown + live preview」「Vim **と** Emacs の両キーマップ」という Boostnote の契約を守れる唯一の選択肢。KaTeX/mermaid/flowchart/sequence は preview 層に温存。
- **Storage primary: OneDrive を「ローカル同期フォルダ」として使う（Graph API ではない）。** Boostnote は既にノートを `<storage>/notes/<key>.cson` の個別ファイルとして書いているため、storage パスを OneDrive 同期フォルダ内に置くだけ＝**コードゼロ・データ移行ゼロ・アプリ保持トークンなし**。
- **OneDrive vs Firebase の結論: 既定は OneDrive（folder sync）。** Firebase はリアルタイム多端末同期 or mobile/web が**ハード要件に昇格した場合のみ**採用し、その時はサイレントな Last-Write-Wins 損失を避ける merge 実装を予算化する。
- **エディタ移行（CM5 → CM6）が全工程で唯一の本質的スパイク。** React/Redux/Electron のバンプには公式の漸進レシピがあり、AI 支援で機械的に消化できる。

## 脅威モデル (Threat Model)

storage を最初に評価する。「誰がノートを読めるか」「token/アカウント漏洩で何が取られるか」「オフライン・暗号化姿勢」を明示する。

| 観点 | OneDrive folder sync（推奨） | OneDrive Graph API | Firebase | 自前 CRDT (Yjs) + E2E |
|---|---|---|---|---|
| **平文を読める主体** | Microsoft + MS アカウント保持者 | Microsoft + MS アカウント保持者 | Google（Firestore に平文） | 誰も（self-hosted relay は ciphertext のみ） |
| **アプリが保持する秘密** | **なし**（同期は OS の OneDrive クライアントが担当） | OAuth refresh token をアプリが保管 | Firebase Auth token をアプリが保管 | E2E 鍵をクライアントが保管 |
| **token/アカウント漏洩の被害** | アプリ侵害だけではクラウド権限ゼロ。被害は MS アカウント侵害そのもの（Microsoft 2FA で保護） | refresh token 漏洩で app folder（`Files.ReadWrite.AppFolder` 利用時）〜全 drive（過剰スコープ時）に read/write | auth token 漏洩で当該ユーザの全ノート | 鍵漏洩でそのユーザの平文。relay 単体は無害（ciphertext のみ） |
| **オフライン姿勢** | `.cson` が source of truth。ネット無しで完全動作 | ローカル `.cson` が source of truth | クラウドが authoritative、ローカルは IndexedDB キャッシュ（`.cson` ではない） | files が source of truth、オフライン設計が中心 |
| **暗号化** | 非 E2E（保存時暗号は MS 任せ） | 非 E2E | 非 E2E | **E2E 可能**（唯一 provider を信頼境界外に出せる） |
| **競合時の挙動** | dumb whole-file: `Note-COMPUTERNAME.cson` 重複（手動解消） | eTag/cTag は見えるが merge は自前 | サーバ timestamp の Last-Write-Wins で**サイレント損失**（自前 merge 必須） | 自動・ロスレス merge |

要点: **OneDrive folder sync はアプリ側の attack surface が最小**（アプリは資格情報を一切持たない）。E2E が**ハード要件**なら、それを満たすのは self-hosted CRDT (Option 4) のみ。OneDrive も Firebase も平文を vendor に預ける点は同じ。

## 推奨スタック

| レイヤ | 推奨 | バージョン / 状態（fact-checked） | License | 主因 |
|---|---|---|---|---|
| Desktop shell | **Electron（維持・最新化）** | v42.5.0 stable（2026-06-24）、v43 beta | MIT | React UI と Node `.cson` I/O を**両方**温存、Chromium 一貫レンダリング |
| Build | electron-vite + Vite | electron-vite 5.0.0（~2025-12） | MIT | webpack 1 config は進化不能、新規構成へ |
| UI framework | **React（維持・19 へ）** | 19.2.7（2026-06-01）、19.0 = 2024-12-05 | MIT | 既存 React+Redux 資産の最大再利用、公式 codemod |
| State | Redux Toolkit | RTK incremental migration guide | MIT | createStore→configureStore→createSlice を漸進 |
| Editor core | **CodeMirror 6** | 6.x（npm packages MIT、active） | MIT（npm package 単位） | CM5 直系、Vim+Emacs 両対応、source+preview 維持 |
| Vim keymap | @replit/codemirror-vim | 6.3.0 | MIT | CM6 向け active |
| React×CM 接続 | @uiw/react-codemirror | 4.25.10 | MIT | React 19 と直結 |
| Preview pipeline | markdown-it + KaTeX + mermaid 等 | 既存温存 | — | preview 層は無改修で再利用 |
| Storage（既定） | **OneDrive folder sync** | OneDrive client（Win/Mac first-party） | N/A | コードゼロ、データ移行ゼロ、トークンなし |
| Storage（条件付き昇格先） | Firebase | Firestore + Auth + Cloud Storage | proprietary（SDK Apache-2.0） | real-time / mobile-web が要件化した時のみ |

## 各軸の比較

### 軸1: Desktop shell / runtime

| 選択肢 | GitHub stars | License | self-host | 最新版 / 状態 | この app への適合 |
|---|---|---|---|---|---|
| **Electron（推奨）** | 122k | MIT | N/A（バンドル runtime） | **v42.5.0 stable（2026-06-24）、v43 beta。8 週 major cadence、最新 3 major のみサポート（40/41/42）** | 最良。React UI と Node `.cson` を両方温存、Chromium 一貫レンダリング、最成熟の mac+win 署名/notarization/auto-update |
| Tauri 2 | 108k | Apache-2.0 OR MIT（dual） | N/A | 2.0 stable since 2024-10、tauri-cli v2.11.3（2026-06） | 強い次点。React 維持・footprint/security 改善だが、Node `.cson` を Rust へ全面 port + WKWebView/WebView2 の IME/contenteditable 差異リスク |
| Wails v3 | 35k | MIT | N/A | **v3 は ALPHA（v3.0.0-alpha2.x、明示の "Alpha Warning"）。stable は v2.12.0（2026-03-26）** | 弱い。長命 app の core を alpha に賭けるのは不可。v2 は旧アーキ |
| Flutter desktop | 178k | BSD-3-Clause | N/A | 3.38 stable（2025-11-12） | 不適。Dart 全面 rewrite、CM6/Monaco 級エディタ・Vim/Emacs の embed 経路なし |
| Avalonia / .NET MAUI | Avalonia 31k / MAUI 23k | MIT（両方） | N/A | Avalonia 12.0.5（2026-06-23）/ MAUI .NET 9-10 cadence | 不適。C#/XAML 全面 rewrite。本格 editor は結局 WebView host が必要で native の意味が消える。MAUI の mac は Mac Catalyst で評判が悪い |
| PWA + thin wrapper（Capacitor） | capacitor-community/electron ~0.4k（398） | MIT | N/A | **last release v5.0.1（2023-09）= 実質 stale** | 最不適。File System Access API は sandbox で多フォルダ `.cson` に不向き、bridge は stale |

> 補正: research の「Electron 37 を modern target」は **outdated**。2026-06-27 時点の最新 stable は **42.5.0（2026-06-24）**で、サポートは最新 3 major のみ。**Electron 37 は既に EOL/非サポート**。移行は「Electron 4 → 42（38 major 跨ぎ）」であり、37 着地は初日から EOL shell に乗る誤り。

### 軸2: UI framework + Editor core

UI framework:

| 選択肢 | GitHub stars | License | 最新版 / 状態 | この app への適合 |
|---|---|---|---|---|
| **React 19（推奨・維持）** | 246k | MIT | 19.2.7（2026-06-01）、19.0 = 2024-12-05、19.2 = 2025-10-01 | 最良。約 3.4k LOC の editor/preview/snippet + react-* が直接 carry over。@uiw/react-codemirror で CM6 と直結 |
| Svelte 5 | **87.4k** | MIT | **5.56.4（2026-06-23）** | 紙上は最小 bundle だが React 資産ゼロ再利用＝solo の経済性に合わない |
| Vue 3 / Nuxt | core 54k（legacy vue ~210k） | MIT | 3.5.39、3.6 beta。**NuxtLabs を Vercel が 2025-07-08 買収（MIT 維持）** | merit は一流（周縁ではない）。負けるのは移行コスト/資産再利用のみ。Electron 内では Nuxt の SSR 価値は無効＝素の Vue 3 になる |
| SolidJS | 35.7k | MIT | 1.9.13（2026-05-15）、2.0 は beta のみ（ship 未定） | raw perf 最良だが生態系最小、2.0 churn、full rewrite。maintenance 用途に不向き |

Editor core:

| 選択肢 | GitHub stars | License | 最新版 / 状態 | この app への適合 |
|---|---|---|---|---|
| **CodeMirror 6（推奨）** | dev repo 7.8k（**2026-04-15 archive、self-host git へ移動**） | **npm package は MIT**（dev meta-repo は NOASSERTION） | npm 継続公開（state 6.x / view 6.x / lang-markdown 6.x） | 最良。source+preview を維持、Vim+Emacs 両対応、markdown-it/KaTeX/mermaid を温存。bus-factor リスクは要注視（単一 maintainer・GitHub 外） |
| Monaco | 46k | MIT | 0.55.1（2025-11-20） | 弱い。IDE 用で重く（数 MB + worker）、source+preview 非対応。Vim は monaco-vim のみ、Emacs なし |
| Lexical | 23.6k | MIT | 0.46.0（2026-06-26、pre-1.0） | 不適。WYSIWYG で source markdown も Vim/Emacs もなし |
| TipTap / ProseMirror | 37k | MIT core（Pro/Cloud は商用） | 3.0 stable（2025）、core 3.27.1（2026-06） | paradigm 不一致。WYSIWYG、Vim/Emacs なし、一部商用 tier の lock-in |
| Milkdown | **11.7k** | MIT | 7.21.2（2026-06-23） | WYSIWYG-markdown の最近接（CM6 を code block に内蔵）だが文書全体の Vim/Emacs なし、ほぼ単一 maintainer |

### 軸3: Storage & Sync

| 選択肢 | stars / 版 | License | self-host | 最新コスト/状態（fact-checked） | この app への適合 |
|---|---|---|---|---|---|
| **OneDrive folder sync（推奨）** | N/A | N/A | N/A（ファイルは可搬） | **無料 5 GB（Outlook と共有）、M365 Personal で 1 TB。2026 に新規 M365 アカウントの既定 quota 厳格化** | 最良。`.cson` をそのまま OneDrive 下へ＝コードゼロ。local-first 完全保持。欠点は whole-file 競合（手動解消） |
| OneDrive Graph API | N/A | N/A | **不可** | delta query GA。2025-09-30 から per-app/per-user/per-tenant 上限が半減（single-user では無関係） | 最低 ROI。sync engine をほぼ全部自作しつつ平文を MS に渡す。Electron 4 は safeStorage 以前で token 保管も自前 |
| **Firebase**（条件付き） | N/A | proprietary（SDK Apache-2.0） | **不可（prod。Emulator は dev のみ）** | **Firestore 無料: 50k reads / 20k writes / 20k deletes 日次 + 1 GiB 保存 + 10 GiB/月 転送。有料: reads $0.06/100k・writes $0.18/100k・storage $0.18/GiB-月（multi-region）。doc 上限 1 MiB。Cloud Storage 無料: 5 GB 保存 + 1 GB/日 DL、有料 storage $0.026/GB・egress $0.12/GB。Auth 無料 50k MAU、Spark は多くの provider を 3,000 DAU に制限** | 中・最大 rewrite。real-time/多端末は唯一即提供、single-user は実質 $0。だが source of truth がクラウドへ移り「ファイルが本体」契約を破る。Last-Write-Wins サイレント損失に注意 |
| 自前 CRDT (Yjs / Automerge) | **Yjs 22.1k / Automerge 6.4k** | MIT（両方） | **可（y-websocket / automerge-repo sync-server）** | **Yjs v13.6.31（2026-05-28）、weekly DL ~6.1M。Automerge v3.2.6（2026-04-22）、weekly DL ~32k（core）** | merge 正しさ・privacy 上限は最良で E2E 可能だが、solo に最重量。y-codemirror は CM5 世代（生態系は CM6 へ）。single-user/2 端末には overkill |

> 補正（Firebase コスト、research の誤りを訂正）: Cloud Storage 無料枠は **5 GB 保存**（1 GB ではない）+ **1 GB/日 DL ≒ 30 GB/月**（10 GB/月 ではない）。egress は **$0.12/GB**（$0.15 ではない）。Firestore の「1 GB/日」は不正確で、正しくは **1 GiB 総保存 + 10 GiB/月転送**。
> 補正（CRDT DL）: Yjs の weekly DL は research の「920k」が大幅過小で実測 **~6.1M**（"by far the largest CRDT ecosystem" はむしろ補強）。Automerge は「85k」が過大で core **~32k**（生態系合算でも ~59k）。

### 軸4: Migration strategy

| 選択肢 | 工数（solo+AI） | リスク | 再利用率 | データ移行 |
|---|---|---|---|---|
| **(A) In-place 漸進（推奨）** | **~8-12 週** | 最低 | **~85-90%** | **ゼロ**（dataApi 不変、同じ `.cson` を読み続ける） |
| (C) Hybrid strangler | ~3-4.5 ヶ月 | 中 | ~70-80% | ゼロ（dataApi 共有） |
| (B) Greenfield rewrite | ~4-6 ヶ月 | 最高（"never ships" 失敗形） | ~40-60% | ゼロ or 一回限り `.cson`→md+frontmatter 変換 |

全選択肢でデータ移行は非論点。dominant spike は全工程で **CodeMirror 5 → 6**（editor-core 全面 rewrite、`setOption`/`addOverlay`/`CodeMirror.Vim`/`findModeByName`/`autoLoadMode` 全非互換、emacs keymap が long-tail）。native shell の選択（Electron 維持 vs Tauri）は renderer モダン化と **orthogonal**なので後回しにする。

## OneDrive vs Firebase 決定表

| 判断軸 | OneDrive folder sync を選ぶ条件 | Firebase を選ぶ条件 |
|---|---|---|
| 同期要件 | **single-user × 複数端末**（数秒〜数分の伝播で十分） | **genuine real-time / 共同編集**が必要 |
| mobile/web | 不要（nice-to-have のまま） | mobile/web が**ハード要件に昇格** |
| local-first | 「ファイルが本体」を厳守したい | クラウド authoritative を許容（ローカルはキャッシュ） |
| 実装余力 | sync コードを書きたくない（solo, maintenance mode） | doc-DB sync 層を Electron+Redux に retrofit する予算がある |
| 競合許容 | whole-file 重複の手動解消で可（任意で `-COMPUTERNAME` 検出 UI を追加） | per-field/CRDT merge を自作して LWW 損失を防ぐ覚悟がある |
| **コスト** | アプリ起因コスト **$0**。無料 5 GB（M365 で 1 TB） | single-user は実質 **$0/月**。ただし read/egress 従量で read-heavy・whole-doc パターンで spike しうる。doc 1 MiB 上限が markdown blob を圧迫 |
| **lock-in** | **最小**。同じフォルダを Dropbox/iCloud/Drive/git に差し替え可能（コード変更ゼロ） | **最大**。data model + Security Rules + SDK が Firebase 固有、self-host 不可、離脱は実工数 |
| **threat-model** | アプリは資格情報を持たない＝侵害でクラウド権限ゼロ。非 E2E（MS は読める） | アプリが auth token 保持。非 E2E（Google は読める）。漏洩で当該ユーザ全ノート |

**判定: 既定 OneDrive folder sync。** Firebase は「real-time 多端末 or mobile/web」が確定した時点で初めて rewrite を前倒しする理由になる。どちらも非 E2E なので、provider に平文を読ませたくないなら別途 self-hosted CRDT + 暗号 payload が必要。

## 移行ロードマップ

Option A（in-place 漸進）。各軸は独立・各ステップで shippable。`.cson` は dataApi 不変で読み続けるため**データ移行は発生しない**。

| Phase | 内容 | 概算工数 | 出荷可否 |
|---|---|---|---|
| **0. 基線確保** | 既存 Jest（components）+ AVA（dataApi）を green に保つ。editor/diagram/export の薄いカバレッジを先に補強（A を安全にする前提） | ~0.5 週 | — |
| **1. build + shell バンプ** | webpack 1 → **electron-vite/Vite**（新規構成）、**Electron 4 → 42（サポート最新版）**。security 既定変更を消化: `contextIsolation` on、`remote` 撤去、`nodeIntegration` off、preload IPC 化 | ~2-3 週 | ◯（最初の shippable milestone） |
| **2. React 16 → 18 → 19** | `npx codemod@latest react/19/migration-recipe`。propTypes/legacy Context/string refs 除去。block する abandoned deps を入替（react-codemirror@1 → @uiw/react-codemirror、react-css-modules → CSS-modules build、connected-react-router → modern router） | ~2-3 週 | ◯ |
| **3. Redux 3.5 → RTK** | `createStore`→`configureStore` を一度だけ swap、以後 reducer を `createSlice` へ触った所から漸進（旧新共存・低リスク） | 並走（Phase 2-4 に分散） | ◯ |
| **4. CodeMirror 5 → 6（唯一の本質スパイク）** | 3 つの editor component を CM6 へ rewrite。Vim = `@replit/codemirror-vim`、**Emacs keymap が long-tail リスク**。CM5 overlay/markText → CM6 decorations、動的 mode auto-load → Lezer language packages へ再マップ。preview（markdown-it/KaTeX/mermaid）は無改修で再利用 | ~2-4 週 | ◯ |
| **5. storage: OneDrive folder sync** | storage パスを OneDrive 同期フォルダ内へ置けるよう案内 + 任意で `-COMPUTERNAME` 競合検出 UI。**コードはほぼゼロ** | ~0.5-1 週 | ◯ |
| **6.（任意・後日）Tauri 2 評価** | renderer モダン化後に footprint/RAM が hard 要件なら Node API（fs/child_process export/command-exists）を Rust command へ port。WKWebView 内で CM6/Vim/Emacs/KaTeX/mermaid を検証してから判断 | 別予算 | — |

データの扱い: `.cson` は `CSON.writeFileSync` で `<storage>/notes/<key>.cson` に書かれ、framework-agnostic な Node dataApi（35 files、既存 `migrateFromV5/V6Storage` パターンあり）が読む。**dataApi を保持すればデータ移行はゼロ。** md+YAML-frontmatter へ移すなら一回限りの変換（cson-to-markdown / boostnote2md 等）+ SNIPPET_NOTE 複数ファイルの round-trip QA が追加で必要。

## 未解決の前提 / 次のアクション

ユーザに確認すべき項目。

1. **エディタ確定ゲート（最優先）**: CodeMirror 6 + `@replit/codemirror-vim` + CM6 emacs binding で **Vim と Emacs の両方**が hard 要件のままか。これが総工数を支配するので、live-preview perf と両キーマップ parity を**他の Phase に着手する前に prototype** すべき。
2. **同期の真の要件**: 「single-user × 2 端末」で十分か、それとも genuine real-time / 共同編集が要るか。前者なら OneDrive 確定、後者のみ Firebase/CRDT を正当化。
3. **mobile/web の昇格可能性**: nice-to-have が将来 hard 要件化するか。Yes なら Firebase の rewrite を今前倒しする唯一の強い理由になり、shell 側も Tauri 2 / Flutter が計算に入る。
4. **E2E 暗号化**: provider にノートを読ませない事が hard 要件か。Yes なら OneDrive も Firebase も失格で、self-hosted CRDT + 暗号 payload のみが満たす。
5. **on-disk フォーマット**: `.cson` 維持（zero-migration・Git 互換最大）か、md+frontmatter へ変換（OneDrive/Obsidian interop 向上だが round-trip QA 追加）か。選んだ sync 層と相互作用する（Firebase は doc model 寄り、OneDrive は file-sync 寄りで `.cson`/.md と自然に組む）。
6. **TypeScript 採用**: 新規コードで TS が hard 要件か。Yes なら Option C の魅力が増す。No なら Option A の単純さが決定的に勝つ。
7. **添付/画像サイズ**: バイナリが OneDrive 無料 5 GB / Cloud Storage egress を超えるか。コスト計算と storage 選択に影響。
8. **Electron 着地版の固定**: サポート最新 3 major（40/41/42）のいずれに乗るか。**37 は EOL なので不可**。8 週 cadence の継続 upgrade 運用を前提に置く。
# Boostnote モダナイゼーション 改訂版（共同編集対応）

> 親文書: [MODERNIZATION-2026-stack-selection.md](./MODERNIZATION-2026-stack-selection.md)
> 確定した2制約による改訂: (1) **リアルタイム共同編集が必須**、(2) **Vim/Emacs は不要**、(3) E2E 暗号化は必須ではない。
> 数値（star数/版/ライセンス/価格）は 2025–2026 のライブソースで事実検証済み。

## 改訂サマリ（何が変わったか）

- **OneDrive folder sync を primary から DROP。** LOCKED CONSTRAINT 1（real-time collaborative editing が hard requirement）により、whole-file folder sync は文字単位の同時編集を表現できず失格。同じノートで Alice が pos5 に `A`、Bob が pos5 に `B` を同時挿入すると、ファイル単位の last-writer-wins では片方が無言で消える。これは「複数デバイス／複数ユーザーが live・低遅延で収束」という要件と原理的に両立しない。→ 収束モデルを **CRDT（Yjs）** に置き換える。
- **データモデルが「note = file」から「note = CRDT update log、.cson = derived snapshot」へ。** Yjs の Y.Doc を source of truth にし、`.cson` は debounce で書き戻す **派生スナップショット** に降格する。これで local-first（オフライン編集）と real-time merge を**単一ライブラリ**で両取りでき、既存のファイル・全文検索・git ワークフローも温存される。
- **エディタ再検討。** LOCKED CONSTRAINT 2（Vim/Emacs 不要）で CodeMirror 6 が唯一解ではなくなり、ProseMirror/TipTap・Lexical・Milkdown が選択肢に復帰。ただし軸は keymap ではなく **collaboration 成熟度 × markdown 忠実度** に変わる（後述の通り、結論は依然として CM6 + Yjs が primary）。
- **新インフラが必須化。** これまで 100% local desktop だった Boostnote に、(1) 常時稼働の sync server、(2) user identity / auth + per-document authorization、(3) presence/awareness UI、(4) サーバ側 document store＋`.cson` snapshot 書き戻し、という**3〜4 個の新サブシステム**が加わる。
- **工数は前回の「8〜12 週」では収まらない。** あの見積りは Electron 4→42 / React 16→19 / CM5→CM6 の**ランタイム＋エディタ近代化のみ**を対象としていた。real-time collaboration は別物の大型作業で、フル実装は **約 4.5〜6.5 ヶ月（≈18〜26 週）** が現実線。
- **E2E は hard requirement ではない**（ユーザーが real-time を E2E より優先）。よって sync server に plaintext を預けることは許容。ただしプログラマのノートは API キー/secret を含みやすいので、誰が plaintext を見るかは依然として設計判断（→ self-host 推奨）。

---

## 改訂版 推奨スタック

各軸 **primary を 1 つ**。バージョン・ライセンス・価格はすべて 2025–2026 のライブソースで fact-check 済み（修正適用後の値を記載）。

| 軸 | Primary 推奨 | License | 最新 / star / 健全性（2026-06） | 価格・自前運用 | 出典 |
|---|---|---|---|---|---|
| **Shell** | Electron（前回どおり →42 へ近代化） | MIT | バージョンは前回 design doc 目標。具体リリース日は **(未確認)** | OSS / 自前ビルド | (prior doc) |
| **UI** | React（→19） | MIT | 19 系。TipTap/Lexical とも React 19 対応を確認 | OSS | tiptap.dev, lexical.dev |
| **Editor core** | **CodeMirror 6 + y-codemirror.next**（source-markdown 維持） | MIT / MIT | CM6 dev repo 7.8k★。**2026-04-15 に GitHub archive、開発は code.haverbeke.berlin（Marijn Haverbeke の solo forge）へ移動。API は frozen-stable・fork 可**。y-codemirror.next は v0.3.5（2024-06-18、約2年新リリース無し＝薄く安定だが low-churn） | $0 | github.com/codemirror/dev, github.com/yjs/y-codemirror.next, code.haverbeke.berlin |
| **Collab data model** | **Yjs（Y.Doc + Y.Text per note）** | MIT | **22.1k★、v13.6.31（2026-05-28）、~6M weekly npm downloads（23.5M/月）**、2015〜 Kevin Jahns 継続、v14 は beta。最も普及した text CRDT | $0（ライブラリ） | github.com/yjs/yjs, npmjs.com/package/yjs |
| **Collab backend** | **self-hosted Hocuspocus** | MIT | **2.5k★（2459）、v4.3.0（2026-06-18）、Hocuspocus 4 stable は 2026-03-10**、Tiptap 社が維持＝bus-factor 低。最終 push 2026-06-26 | OSS。実コスト = **フラットな VPS ~$5–12/mo**＋TLS＋backup（per-MAU 課金なし、内容は自分の箱に残る） | github.com/ueberdosis/hocuspocus, tiptap.dev/docs/hocuspocus |
| **Storage / persistence** | **Yjs doc = source of truth**。local: **y-indexeddb**、server: Hocuspocus **onStoreDocument** で Postgres/SQLite ＋ debounce した **`.cson` snapshot 書き戻し** | MIT | y-indexeddb は Yjs 公式 provider | $0＋VPS/DB | docs.yjs.dev |
| **Auth（multi-USER の場合のみ）** | **Clerk**（onAuthenticate ゲート用 JWT 発行） | proprietary（SDK は OSS） | **無料 50,000 MAU まで**（2026 に 10k→50k へ。実体は Monthly Retained Users 計測なので余裕はさらに大）。Pro $20/mo（年払）/$25/mo（月払）＋$0.02/MRU | この規模で実質 **$0** | clerk.com/pricing |

参考（採用しないが比較対象、fact-check 済み）:
- **Automerge** MIT・6.4k★・v3.2.6（2026-04-22）。automerge-repo は ~689★で **alpha（v2.6.0-alpha.2）**＝アプリ層が Yjs より未確定。エディタ binding 生態系も薄い → **#2**（git 風の note 履歴/branch を最優先する時だけ）。
- **ShareDB（OT）** MIT・6.5k★・v6.0.0（2026-06-23）。文字単位 merge は正しいが **server-authoritative・serverless/peer モード無し**＝offline-first が CRDT より弱い → local-first 価値と相反。
- **Firestore（field LWW）** は **データモデルとして失格**（同時編集を無言で破棄）。CRDT バイナリの dumb transport にはできるが per-op 課金が keystroke トラフィックを罰する。Tiptap Cloud は **free tier 撤廃（2025-06）**、現行 **Start $59/mo（500 docs/env）/ Team $179/mo / Business $1,199/mo**（旧 $49/$149/$999 から値上げ済み）。

---

## 脅威モデル（共同編集版）

sync server がループに入った今、**誰が plaintext を見るか**が新しい論点。**E2E はユーザーが明示的に「不要」と判断済み**なので、provider に平文を預けること自体は許容。ただしプログラマのノートは API キー・secret・接続文字列を含みやすいので、trust boundary をどこに引くかは依然として製品判断。

- **Yjs には access control が無い。** WebSocket に到達でき doc id を知っていれば、誰でも read/write 可能（gate しない限り world-readable/writable）。→ **auth は UX の飾りではなく security 要件**。Hocuspocus の `onAuthenticate` フックで必ずゲートする。
- **self-hosted（推奨: Hocuspocus / y-sweet）**: 平文は**自分の VPS / S3 に留まり、あなたが data controller**。trust boundary = 自分のサーバ＋backup。flat コスト・no lock-in。プログラマのノート（secret 含有）にはこれが最適。
- **managed（Liveblocks / Tiptap Cloud / Jamsocket / Cloudflare）**: vendor が平文を保存する＝**vendor 侵害でノートが露出**。E2E 不要の判断下では許容だが、コンプライアンス実績のある vendor を選ぶこと。
- **将来の保険**: Yjs server は **opaque な update バイト列を中継**するだけなので、後から client-side 暗号化を server の協力なしに被せられる。OT / Firestore はこれをきれいに真似できない。E2E は今は不要だが、退路は Yjs 側にだけ残る。
- **Electron 実装上の注意**: bearer token は **main プロセスの `safeStorage`** に保持。renderer の `localStorage` には置かない。
- **at-rest（任意）**: E2E 不要でも、server の document store＋backup の at-rest 暗号化は breach blast radius を下げるので検討に値する。

---

## エディタ決定

**結論: CodeMirror 6 + y-codemirror.next（source-markdown 維持）を primary に据える。** Vim/Emacs が外れたことで WYSIWYG は「圏内」に戻ったが、それは「source-markdown が圏外」を意味しない。決め手は CRDT payload の形：

| | CRDT が持つもの | `.cson` への写像 | 既存 preview pipeline | 移行規模 |
|---|---|---|---|---|
| **CM6 + y-codemirror.next** ✅ | **markdown 文字列（単一 Y.Text）** | **1:1**（`content = ytext.toString()`） | **markdown-it/KaTeX/mermaid をそのまま再利用** | 最小（既に CM5＝in-family の CM5→CM6 upgrade） |
| TipTap / ProseMirror | ProseMirror **JSON tree** | lossy な serialize/deserialize 境界 | node view として**再実装**（破棄） | 大（UX rewrite） |
| Lexical | Lexical **JSON tree** | lossy（最も不完全） | 再実装（破棄）＋**pre-1.0（0.x）API churn** | 大＋不安定 |
| Milkdown | ProseMirror tree（**Remark で markdown が first-class**） | WYSIWYG 中では最良だが依然 tree | 再実装（破棄） | 中〜大、生態系最小 |

理由:
1. **markdown 文字列が CRDT payload** = `.cson` への写像が自明で、source of truth が「文字列」のまま動かない。WYSIWYG はすべて source of truth を「tree」に移し、markdown を lossy な境界にしてしまう。
2. **既存の markdown-it / KaTeX / mermaid live-preview pipeline をそのまま温存**できる。25k SLOC・solo＋AI 維持の legacy app で、これを捨てて node view 群に再実装するのは過大投資。
3. **移行 delta が最小**。Boostnote は今 CM5 なので、これは editor paradigm の変更ではなく in-family upgrade ＋薄い Yjs binding。`yCollab` 拡張が remote cursor / awareness / shared undo を標準提供。
4. プログラマ audience は raw markdown ＋ fenced code block の直接制御を好む。

**runner-up（将来 WYSIWYG が本当に必要になったら）: Milkdown**（Remark で markdown round-trip が最良＝`.cson` が本物の markdown のまま）。TipTap は collab 成熟度は最高だが tree-as-CRDT の lossy 境界。Lexical は pre-1.0 churn が maintenance-mode 方針と矛盾するため当面回避。これは **Phase 5 の optional** 扱いにする。

留意: SNIPPET_NOTE（1 ノート＝複数 CodeMirror インスタンス）は **per-snippet Y.Text を Y.Array に並べる**配線が必要。

---

## 同期バックエンド決定表

Yjs CRDT を選んだ時点で Y.Doc は portable・provider は swappable なので、lock-in は data ではなく SDK/glue 層に限定される（managed で始めて後で self-host へ寄せる、が安全に可能）。

| 選択肢 | 種別 / License | コスト形状 | lock-in | ops 負荷 | 採否 |
|---|---|---|---|---|---|
| **self-hosted Hocuspocus** | self-host / MIT・2.5k★・v4.3.0 | **フラット VPS ~$5–12/mo**（常時 socket でも一定） | 低（pure Yjs、swappable） | 自分で uptime/TLS/backup（単一プロセス子守） | **PRIMARY**。`onAuthenticate` で security gate、`onStoreDocument` が `.cson` 書き戻しの自然な置き場 |
| **y-sweet（Jamsocket）** | self-host or managed / MIT・~1.0k★・**v0.9.1（2025-09-16）、最終 push 2025-12-04＝約6ヶ月停滞** | self-host: $0＋自前 S3（GB 単価は微小） / managed: usage（ページ gated・**未確認**） | 低（pure Yjs） | S3 persistence＋doc access token 内蔵で Hocuspocus より配線少 | **強い self-host FALLBACK**。release cadence が遅い点だけ留意 |
| **PartyServer on 自分の Cloudflare 口座** | semi-self-host / **ISC**（partyserver/y-partyserver）・partysocket v1.3.0 | Workers Paid **$5/mo**＋DO usage。**DO hibernation で idle socket ≈ $0**（常時接続の desktop に最適な形状） | 低（自分の CF 口座にデプロイ） | Workers＋DO＋persistence＋Yjs glue を自前で組む | edge 低遅延＋pay-as-you-go が欲しく glue を書ける場合の managed-but-portable 候補。CF が平文を見る |
| **Liveblocks（managed）** | proprietary（SDK は OSS、self-host 不可） | Free $0（1GB realtime・10 conn/room・watermark）。Pro **$30/mo**（年 $25）＋metered **~$0.002/collab-min・~$0.01/comment**。Team **$600〜~$5,000/mo** | 高（proprietary SDK・Comments/Presence） | **ゼロ ops**（turnkey presence/comments/history） | **per-connection-minute 課金が常時接続の desktop に最悪**（8h/日で **≈$29/user/月**）。turnkey UX が欲しく user 数が小さい時のみ |
| **Firebase / y-fire** | proprietary＋y-fire MIT・**77★・v2.1.1（2024-10-07）stale** | Spark 無料は日次ハードキャップ（20k writes/day）。Blaze は **writes $0.18/100K** で write-amplification がコスト膨張 | 高（GCP） | ゼロ ops だが provider が hobby・bus-factor 1 | 既に Firebase 全振りの時だけ。Yjs-native でない |
| **Supabase Realtime / y-supabase** | Realtime Apache-2.0（self-host 可）＋y-supabase MIT・**141★・最終 commit 2023-08-17＝約3年放置** | Free 200 conn・2M msg/mo・500MB DB。Pro $25/mo | 中（transport は self-host 可） | persistence を自前。provider が experimental | 既に Supabase 運用中の時だけ。primary 不可 |
| **y-websocket-server（reference）** | self-host / MIT・55★・v0.1.2 | $0＋host | 低 | **in-memory・no-auth・no-persistence（README 明記）** | PoC 専用。本番化＝Hocuspocus の再発明。学習後に卒業 |
| Vercel（serverless） | — | — | — | — | **transport host として不可**（serverless は WebSocket を保持できない）。Electron client なのでそもそも moot |

**意思決定**: solo maintainer・予測可能コスト・平文を自分の箱に留めたい → **self-hosted Hocuspocus** を primary、**y-sweet（自前 S3）** を fallback。launch 時に常時稼働プロセスすら重ければ、**Jamsocket-managed y-sweet**（同一 codebase で後から in-house 化）か **自分の CF 口座 + PartyServer**（DO hibernation のコスト形状が最良）を escape hatch にする。Liveblocks は turnkey UX が要件化した時のみ。

---

## 改訂版 移行ロードマップ＋工数

**正直な再見積り: フル collab vision は ≈18〜26 週（約 4.5〜6.5 ヶ月）。** 前回の「8〜12 週」は Phase 0（ランタイム＋エディタ近代化）だけを指しており、collaboration は backend・auth・新データモデルという**3 サブシステム追加**ぶん、その上に **≈10〜14 週**が積み増される。

### `.cson` → Yjs/CRDT への写像（file persistence 維持）

- **1 ノート = 1 Y.Doc。**
  - `content` → **Y.Text**（文字単位 merge、編集消失なし）
  - metadata（`title` / `tags` / `isStarred` / `isTrashed` / `createdAt` / `updatedAt`）→ **Y.Map**
  - SNIPPET_NOTE の snippets → **Y.Array<Y.Map{ name, mode, content: Y.Text, linesHighlighted }>**
- **Y.Doc が merge-authoritative な store、`.cson` は derived snapshot に降格。** debounce した observer（client 側 and/or Hocuspocus `onStoreDocument`）が Y.Doc を**既存の `.cson` 形状そのまま**に serialize（`content = ytext.toString()`）して `browser/.../notes/<key>.cson` に書き戻す。→ 既存のフォルダ構成・`exportNote`/`exportFolder`・「ディスク上の plain file」がすべて生存。
- **一度きりの冪等 import script**: 既存各 `.cson`（`createNote.js`/`updateNote.js` が形状を示す）を読む → Y.Doc を構築 → `content` を Y.Text に挿入＋Y.Map を populate → 初期 Yjs update を emit。これで旧来の **whole-file last-writer-wins ハザードを除去**。
- **local-first**: 各 client は **y-indexeddb**（および任意でファイル）にオフラインコピーを保持。awareness protocol が live cursor / presence を提供。

### フェーズ（solo ＋ AI-assisted）

| Phase | 内容 | 工数 |
|---|---|---|
| **0** | Baseline 近代化（＝前回 8–12 週）: Electron/React/build upgrade ＋ CM5→CM6。collab から独立、先に出荷 | 8–12 週 |
| **1** | **Local-first Yjs swap（単一デバイス）**: Y.Doc を source of truth 化、y-indexeddb、`.cson` snapshot writer、import script。ネットワーク無し。crash-safe・conflict-free な単独価値を即提供 | 3–4 週 |
| **2** | **Sync transport ＋ self-hosted server**: Hocuspocus/y-sweet を立て、y-websocket provider で**自分のデバイス間**を shared secret 越しに同期。`.cson` 書き戻しを `onStoreDocument` へ移設 | 2–3 週 |
| **3** | **Auth ＋ authorization ＋ presence**: Clerk JWT → `onAuthenticate` gate（Yjs の open-door を塞ぐ）、per-note ACL、awareness cursor。**※multi-device 専用なら Clerk を device-pairing に置換して 1–2 週に圧縮** | 3–4 週（device-pairing なら 1–2 週） |
| **4** | **Hardening ＋ QA**: offline reconnect、large-doc／snippet edge case、`.cson` reconciliation、multi-user 並行性テスト、threat-model レビュー、backup | 2–3 週 |
| **5（optional）** | **WYSIWYG（Milkdown）** を望むなら | 別途 |

→ Phase 0 の 8–12 週に collab 固有 **10–14 週**を積んで **≈18–26 週**。Electron 4 の Chromium 下で WebSocket / y-indexeddb が動くかは早期に検証（Phase 0 で Electron→42 へ寄せるなら、そこで併せて確認）。

---

## 次に決めるべきこと

1. **「複数ユーザー」か「1 ユーザーの複数デバイス」か（最大の scope レバー）。** 後者なら auth provider を device-pairing に置換でき、Phase 3 を大幅短縮＝総工数が約 1 ヶ月減る。これが auth/authz サブシステムの有無を決める。
2. **source-markdown 維持（推奨: CM6+Yjs）か WYSIWYG rewrite（Milkdown / TipTap / Lexical）か。** 製品 UX 判断で工数影響が大。
3. **sync server を self-host（フラットコスト・平文は自分の箱・ops を持つ）するか managed（高速・per-usage・vendor が平文を見る）するか。** solo dev の ops 許容度次第。
4. **共有/authorization の粒度**: per-note / per-folder / per-storage のどれか。authz モデルと auth UX を決める。
5. **`.cson` の永続契約**: Y.Doc を常に authoritative とし `.cson` を snapshot とするか（推奨）、`.cson` を canonical に残すか。後者なら **アプリ外で（直接編集や git で）ファイルが書き換わった時の precedence**（Y.Doc state vs file mtime）を定義する必要。
6. **CRDT 履歴の compaction ポリシー**: tombstone/position メタデータで長寿命ノートが肥大するので、いつ snapshot/GC するか（time-travel を将来欲しいなら履歴をどこまで残すか）。
7. **永続レイアウト**: Yjs バイナリを **sidecar（`note.ybin`）**にするか、**既存 `.cson` に base64 埋め込み**にするか。sidecar は git diff がきれいだが 1 ノート 2 ファイル、埋め込みは 1 ファイルだが `.cson` が肥大/可読性低下。
8. **コスト天井**: 現実的な同時 user/room 数。flat-VPS Hocuspocus と usage 課金 managed のどちらが長期的に安いかを決める。
9. **managed 価格の最終確認**: Jamsocket-hosted y-sweet（pricing ページが gated・**未確認**）と、常時接続 client での Liveblocks credit 消費を、コミット前に実測すること。

---

## 決定確定（2026-06-28・ユーザー回答反映）

上記「次に決めるべきこと」のうち最大レバーの2つが確定した。

| 決定項目 | 確定内容 | 効果 |
|---|---|---|
| **共同編集の範囲** | **自分の複数端末のみ**（他ユーザーとは共有しない） | フル認証(Clerk/per-note ACL)は**不要**。**device-pairing**（共有シークレット/ペアリングトークンで端末を紐付け）に置換。Phase 3 が 3–4週 → **1–2週**に圧縮 |
| **同期サーバ運用** | **self-host（Hocuspocus）** を自分の VPS に | 平文は**自分の箱**に留まる（プライバシー境界＝自分）。コストは**フラット ~$5–12/月**、per-user 課金なし、lock-in 最小。ops は自分で（単一プロセス＋TLS＋backup） |

### 確定後のアーキテクチャ（最終形）
- **データモデル**: 1 ノート = 1 Yjs `Y.Doc`（`content`→`Y.Text`、metadata→`Y.Map`、snippets→`Y.Array<Y.Map>`）。`.cson` は debounce で書き戻す**派生スナップショット**。
- **エディタ**: **CodeMirror 6 + y-codemirror.next**（source-markdown 維持、`yCollab` で remote cursor/awareness/shared-undo）。preview(markdown-it/KaTeX/mermaid) は温存。
- **同期**: client `y-indexeddb`（local-first）↔ **self-hosted Hocuspocus**（`onAuthenticate` で device-pairing トークン検証、`onStoreDocument` で `.cson` 書き戻し）。
- **認証**: device-pairing（multi-user 認証プロバイダなし）。ただし Yjs に access control は無いので、**未ゲートの WebSocket を晒さない**ことは依然セキュリティ要件。
- **永続契約**: Y.Doc を常に authoritative、`.cson` を snapshot とする（外部直接編集の precedence 問題を避ける）。

### 改訂後の工数（device-pairing 短縮反映）
- Phase 0 近代化 8–12週 ＋ collab 固有（Phase 1: 3–4週 ＋ Phase 2: 2–3週 ＋ Phase 3: **1–2週** ＋ Phase 4: 2–3週）= **≈16–24週（約4–6ヶ月）**。

### 推奨する最初の de-risk（着手順）
1. **CM5 → CM6 の独立 PoC**（最大の本質スパイク）: 既存の markdown-it/KaTeX/mermaid preview を温存したまま 1 つの editor component を CM6 化し、live-preview perf を確認。
2. **Yjs + y-codemirror.next + 自前 Hocuspocus の最小 PoC**: 2 つの Electron ウィンドウ間で 1 ノートを同時編集 → `.cson` 書き戻しまで通す。
3. これらは現行 legacy app とは**別ブランチ/別 PoC**で行い、確証後に Phase 0（Electron→42 等のメジャー更新）へ。メジャー更新は CLAUDE.local.md で「破壊的」と警告される領域なので ADR で計画的に取り込む。
import type { Note, Storage } from '../types'

// Sample data shaped exactly like real `.cson` notes, so the UI is populated
// while the Electron `.cson` loader is built. Mirrors the legacy layout
// (one "client" storage with coloured folders).

export const sampleStorages: Storage[] = [
  {
    key: 'client',
    name: 'client',
    folders: [
      { key: 'aim', name: 'AIM', color: '#e6b800' },
      { key: 'kdd', name: 'KDD', color: '#e6b800' },
      { key: 'ksr', name: 'KSR/BnS', color: '#4ade80' },
      { key: 'others', name: 'Others', color: '#e6b800' },
      { key: 'epigno', name: 'Epigno', color: '#4ade80' },
      { key: 'caraquri', name: 'CARAQURI', color: '#e6b800' },
      { key: 'nextgem', name: 'NextGem', color: '#4ade80' },
      { key: 'unknown', name: 'Unknown 1', color: '#ff2d75' }
    ]
  }
]

const t = (d: string) => new Date(d).toISOString()

export const sampleNotes: Note[] = [
  {
    key: 'n-cls',
    type: 'MARKDOWN_NOTE',
    title: 'CLS (Cumulative Layout Shift) 改善計画',
    tags: ['performance', 'seo'],
    storage: 'client',
    folder: 'aim',
    isStarred: true,
    isTrashed: false,
    createdAt: t('2025-12-03'),
    updatedAt: t('2025-12-03T10:00:00'),
    content: `# CLS (Cumulative Layout Shift) 改善計画

## テスト

- xxx
- xx2

2025/12/3

## 現在のPR概要

### PR: TOPページCLS改善 (feature/1172_CLS-Performance)

**対象ファイル**: \`pages/index.vue\`

#### 変更内容

1. **Iconコンポーネントの置き換え**
   - \`<Icon name="ph:xxx">\` を \`<i class="modIcon modIcon--xxx">\` に変更
   - 動的にロードされるアイコンを事前定義されたCSSアイコンに置換
   - CLSの主要因だったアイコンの遅延レンダリングを解消

2. **Tailwind動的クラスからスコープ付きCSSへの移行**
   - 複雑なgridレイアウト定義をスコープ付きCSSに移動
   - レイアウトの安定性向上

\`\`\`js
// before
grid-cols-[2fr_16px_1fr_16px_1fr_2.4fr_140px]
\`\`\`
`
  },
  {
    key: 'n-seo-review',
    type: 'MARKDOWN_NOTE',
    title: 'SEO改善レビュー・デバッグ',
    tags: ['seo'],
    storage: 'client',
    folder: 'aim',
    isStarred: false,
    isTrashed: false,
    createdAt: t('2025-11-28'),
    updatedAt: t('2025-12-02T09:00:00'),
    content: `# SEO改善レビュー・デバッグ\n\n- [ ] メタ情報の確認\n- [ ] 構造化データ\n- [ ] sitemap.xml\n\n> ベンチ: HackMD / Obsidian\n`
  },
  {
    key: 'n-se-seo',
    type: 'MARKDOWN_NOTE',
    title: 'SE / SEO',
    tags: ['seo'],
    storage: 'client',
    folder: 'aim',
    isStarred: false,
    isTrashed: false,
    createdAt: t('2025-11-20'),
    updatedAt: t('2025-12-01T12:00:00'),
    content: `# SE / SEO\n\n| 項目 | 状態 |\n|---|---|\n| title | ✅ |\n| description | ✅ |\n| OGP | ⏳ |\n`
  },
  {
    key: 'n-aim-api',
    type: 'SNIPPET_NOTE',
    title: 'AIM API',
    tags: ['api', 'snippet'],
    storage: 'client',
    folder: 'aim',
    isStarred: true,
    isTrashed: false,
    createdAt: t('2025-10-10'),
    updatedAt: t('2025-11-15T08:00:00'),
    content: `# AIM API\n\n\`\`\`bash\ncurl -s https://api.example.com/v1/jobs \\\n  -H "Authorization: Bearer $TOKEN"\n\`\`\`\n`
  },
  {
    key: 'n-gcs',
    type: 'MARKDOWN_NOTE',
    title: 'Google Search Console ドメイン設定',
    tags: ['seo', 'ops'],
    storage: 'client',
    folder: 'kdd',
    isStarred: false,
    isTrashed: false,
    createdAt: t('2025-09-01'),
    updatedAt: t('2025-10-20T14:00:00'),
    content: `# Google Search Console ドメイン設定\n\n1. プロパティ追加\n2. DNS TXT レコード\n3. 検証\n`
  },
  {
    key: 'n-ticketlog',
    type: 'SNIPPET_NOTE',
    title: 'チケットログ',
    tags: ['log'],
    storage: 'client',
    folder: 'kdd',
    isStarred: false,
    isTrashed: false,
    createdAt: t('2025-08-15'),
    updatedAt: t('2025-09-30T16:00:00'),
    content: `# チケットログ\n\n- #1021 SEO最適化実装\n- #1172 CLS-Performance\n`
  },
  {
    key: 'n-math',
    type: 'MARKDOWN_NOTE',
    title: 'マーケティングと技術解決',
    tags: ['note'],
    storage: 'client',
    folder: 'others',
    isStarred: false,
    isTrashed: false,
    createdAt: t('2025-07-01'),
    updatedAt: t('2025-08-10T11:00:00'),
    content: `# マーケティングと技術解決\n\nインライン数式 $E = mc^2$ とブロック:\n\n$$\\\\int_0^1 x^2 dx = \\\\frac{1}{3}$$\n`
  },
  {
    key: 'n-dev',
    type: 'MARKDOWN_NOTE',
    title: '開発あれこれ',
    tags: ['dev'],
    storage: 'client',
    folder: 'epigno',
    isStarred: false,
    isTrashed: false,
    createdAt: t('2025-06-01'),
    updatedAt: t('2025-07-05T10:00:00'),
    content: `# 開発あれこれ\n\n- CodeMirror 6 へ移行\n- Yjs で共同編集\n- .cson は派生スナップショット\n`
  }
]

import type { Note, Storage } from '../types'
import { sampleNotes, sampleStorages } from './sampleNotes'

/**
 * The data-layer seam. The renderer only ever talks to a NotesRepository;
 * the Electron build will provide an implementation that reads/writes real
 * `.cson` files in the main process and bridges them over IPC. The browser
 * foundation uses an in-memory repository seeded with sample data.
 */
export interface NotesRepository {
  load(): Promise<{ storages: Storage[]; notes: Note[] }>
}

// Deterministic (no Math.random) generator so the list reaches realistic
// scale (~the user's 274 notes) for virtualization, without flaky output.
function generateNotes(count: number): Note[] {
  const folders = sampleStorages[0].folders
  const titles = [
    'SEO改善レビュー',
    'API 設計メモ',
    'パフォーマンス計測',
    'リリースノート',
    'ミーティング議事録',
    'バグ調査ログ',
    'インフラ構成',
    'デザインレビュー',
    'スプリント計画',
    'リサーチ'
  ]
  const out: Note[] = []
  for (let i = 0; i < count; i++) {
    const folder = folders[i % folders.length]
    const base = titles[i % titles.length]
    const day = ((i * 7) % 27) + 1
    const month = ((i * 3) % 11) + 1
    out.push({
      key: `gen-${i}`,
      type: i % 5 === 0 ? 'SNIPPET_NOTE' : 'MARKDOWN_NOTE',
      title: `${base} #${i + 1}`,
      tags: i % 3 === 0 ? ['wip'] : i % 4 === 0 ? ['done', 'review'] : [],
      storage: 'client',
      folder: folder.key,
      isStarred: i % 11 === 0,
      isTrashed: false,
      createdAt: new Date(2025, month - 1, day).toISOString(),
      updatedAt: new Date(2025, month - 1, day, (i % 23) + 1).toISOString(),
      content: `# ${base} #${i + 1}\n\nフォルダ: **${folder.name}**\n\n- 項目 A\n- 項目 B\n\n\`\`\`ts\nconst x = ${i}\n\`\`\`\n`
    })
  }
  return out
}

/** In-memory repository: the 8 curated notes + generated notes for scale. */
export function createInMemoryRepository(scaleTo = 280): NotesRepository {
  const extra = Math.max(0, scaleTo - sampleNotes.length)
  const notes = [...sampleNotes, ...generateNotes(extra)]
  return {
    async load() {
      return { storages: sampleStorages, notes }
    }
  }
}

/** ショートカットの一覧。ヘルプの重ね表示と設定の「ホットキー」で同じものを出す */
export const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: '⌘/Ctrl + N', desc: '新規ノート' },
  { keys: '⌘/Ctrl + F', desc: 'このノート内を検索（Enter で次、Shift + Enter で前）' },
  { keys: 'Ctrl + L', desc: 'ノート一覧の検索にフォーカス' },
  { keys: '⌘/Ctrl + B', desc: 'サイドバーを 展開 → 畳む → 隠す' },
  { keys: '⌘/Ctrl + Shift + B', desc: 'ノート一覧を 展開 → 畳む → 隠す' },
  { keys: '⌘/Ctrl + E', desc: 'エディタとプレビュー ↔ プレビューだけ' },
  { keys: '⌘/Ctrl + Shift + E', desc: 'エディタだけ → 両方 → プレビューだけ' },
  { keys: '⌘/Ctrl + I', desc: '斜体（選択をトグル）' },
  { keys: '⌘/Ctrl + K', desc: 'リンク化' },
  { keys: '⌘/Ctrl + /', desc: '今日の日付を入れる' },
  { keys: '⌘ + Option + /（Windows は Ctrl + Shift + /）', desc: '今の日時を入れる' },
  { keys: '⌘/Ctrl + Shift + F', desc: 'Markdown を整える（prettier）' },
  { keys: '⌘/Ctrl + Shift + S', desc: '選んだ行を並べ替える' },
  { keys: '⌘/Ctrl + ,', desc: '設定を開く' },
  { keys: 'Esc', desc: '開いている画面を閉じる' }
]

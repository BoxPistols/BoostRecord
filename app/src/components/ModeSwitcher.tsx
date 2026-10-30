import { Columns2, Eye, Pencil } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ViewMode } from '../layout'

// デスクトップ版の ModeSwitcher（Editor / Split / Preview の 3 つで 1 つの部品）と同じ並び
const MODES: { key: ViewMode; Icon: LucideIcon; label: string }[] = [
  { key: 'EDITOR', Icon: Pencil, label: 'エディタだけ' },
  { key: 'SPLIT', Icon: Columns2, label: 'エディタとプレビュー' },
  { key: 'PREVIEW', Icon: Eye, label: 'プレビューだけ' }
]

interface Props {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  /** キーの案内（設定の「ホットキー」で変わる） */
  hint: string
}

export function ModeSwitcher({ mode, onChange, hint }: Props) {
  return (
    <div className="mode-switcher" role="group" aria-label="表示の切り替え">
      {MODES.map(m => (
        <button
          key={m.key}
          className={`mode-seg ${mode === m.key ? 'active' : ''}`}
          title={`${m.label}（${hint}）`}
          aria-label={m.label}
          aria-pressed={mode === m.key}
          onClick={() => onChange(m.key)}
        >
          <m.Icon size={15} aria-hidden />
        </button>
      ))}
    </div>
  )
}

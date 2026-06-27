import { useState } from 'react'
import { addTag, removeTag } from '../data/tags'

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
}

/** Inline tag editor: chips with remove, plus an input that adds on Enter/comma. */
export function TagEditor({ tags, onChange }: Props) {
  const [draft, setDraft] = useState('')

  function commit() {
    const next = addTag(tags, draft)
    if (next !== tags) onChange(next)
    setDraft('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(removeTag(tags, tags[tags.length - 1]))
    }
  }

  return (
    <div className="tag-bar">
      {tags.map(tag => (
        <span key={tag} className="tag-chip">
          #{tag}
          <button
            className="tag-x"
            onClick={() => onChange(removeTag(tags, tag))}
            title="タグを削除"
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="tag-input"
        value={draft}
        placeholder="＋ タグ"
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  )
}

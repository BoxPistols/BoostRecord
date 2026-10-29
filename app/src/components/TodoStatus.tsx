import { ListChecks } from 'lucide-react'

// デスクトップ版の TodoProcess（一覧の「N of M」と進み具合の棒）に合わせる
export function TodoStatus({
  total,
  completed,
  bar = false
}: {
  total: number
  completed: number
  /** 進み具合の棒も出す（ノートの見出し） */
  bar?: boolean
}) {
  if (total === 0) return null
  const percent = Math.floor((completed / total) * 100)
  return (
    <span className="todo-status" title={`タスク ${total} 件のうち ${completed} 件が完了（${percent}%）`}>
      <ListChecks className="ic" size={12} aria-hidden />
      {completed}/{total}
      {bar && (
        <span className="todo-bar" aria-hidden>
          <span style={{ width: `${percent}%` }} />
        </span>
      )}
    </span>
  )
}

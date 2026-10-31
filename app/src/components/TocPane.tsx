import { useMemo } from 'react'
import { X } from 'lucide-react'
import type MarkdownIt from 'markdown-it'
import { extractHeadings } from '../markdown/headings'

interface Props {
  content: string
  /** プレビューと同じ変換。同じ解析結果から拾うので、プレビューの見出しと食い違わない */
  md: MarkdownIt
  minLevel: number
  maxLevel: number
  /** 見出しの行（0 始まり）へ、プレビューとエディタを動かす */
  onJump: (line: number) => void
  onClose: () => void
  closeHint: string
}

/** 目次。デスクトップ版の TocPane と同じく、プレビューの右に置いて行番号で飛ぶ */
export function TocPane({ content, md, minLevel, maxLevel, onJump, onClose, closeHint }: Props) {
  const headings = useMemo(
    () => extractHeadings(md.parse(content, {}), { minLevel, maxLevel }),
    [content, md, minLevel, maxLevel]
  )
  // 一番浅い見出しを基準に字下げする。H2 から始まるノートで全部が一段下がって見えないように
  const base = Math.min(...headings.map(h => h.level))

  return (
    <nav className="toc-pane" aria-label="目次">
      <div className="toc-head">
        <span>目次</span>
        <button className="toc-close" onClick={onClose} title={`目次を隠す（${closeHint}）`} aria-label="目次を隠す">
          <X size={14} aria-hidden />
        </button>
      </div>
      {headings.length === 0 ? (
        <div className="toc-empty">このノートに見出しはありません</div>
      ) : (
        <ul className="toc-list">
          {headings.map(h => (
            <li key={`${h.line}-${h.text}`}>
              <button
                className="toc-item"
                style={{ paddingLeft: 10 + (h.level - base) * 12 }}
                title={h.text}
                onClick={() => onJump(h.line)}
              >
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

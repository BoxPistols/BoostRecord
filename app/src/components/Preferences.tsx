import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { DEFAULT_CONFIG, FONT_SIZE, INDENT_SIZES, THEMES } from '../config'
import type { Config, ThemeName } from '../config'
import { SHORTCUTS } from '../shortcuts'

// タブの並びと名前はデスクトップ版の設定（PreferencesModal）と同じ。
// Web 版に無い機能（AI・画像・スニペット・エクスポート）のタブは出さない。
// AI はブラウザから外部の API へ鍵を送ることになるので、Web 版では扱わない
const TABS = [
  { key: 'STORAGES', label: 'ストレージ' },
  { key: 'HOTKEY', label: 'ホットキー' },
  { key: 'UI', label: 'インターフェース' },
  { key: 'INFO', label: 'BoostRecord について' }
] as const
export type PrefTab = (typeof TABS)[number]['key']

const darkThemes = (Object.keys(THEMES) as ThemeName[]).filter(t => THEMES[t].dark)
const lightThemes = (Object.keys(THEMES) as ThemeName[]).filter(t => !THEMES[t].dark)

interface Props {
  open: boolean
  initialTab?: PrefTab
  config: Config
  onChange: (config: Config) => void
  onClose: () => void
  /** ストレージのタブに出す、今の保存先の説明 */
  storageSummary: ReactNode
}

/**
 * 設定。変えた値はその場で画面に当てて保存する（デスクトップ版は「保存」を押すまで
 * 当たらないが、Web 版は 1 画面で結果が見えるので、押し忘れで消える方を避けた）
 */
export function Preferences({ open, initialTab = 'UI', config, onChange, onClose, storageSummary }: Props) {
  const [tab, setTab] = useState<PrefTab>(initialTab)
  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null

  const set = <S extends keyof Config>(section: S, patch: Partial<Config[S]>) =>
    onChange({ ...config, [section]: { ...config[section], ...patch } })

  return (
    <div className="overlay" onClick={onClose}>
      <div className="prefs" role="dialog" aria-label="設定" onClick={e => e.stopPropagation()}>
        <nav className="prefs-nav" aria-label="設定の項目">
          <div className="prefs-title">設定</div>
          {TABS.map(t => (
            <button
              key={t.key}
              className={`prefs-tab ${tab === t.key ? 'active' : ''}`}
              aria-current={tab === t.key ? 'page' : undefined}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="prefs-body">
          <button className="prefs-close" onClick={onClose} title="閉じる (Esc)" aria-label="閉じる">
            <X size={16} aria-hidden />
          </button>

          {tab === 'STORAGES' && (
            <section>
              <h2 className="prefs-h">ストレージ</h2>
              {storageSummary}
            </section>
          )}

          {tab === 'HOTKEY' && (
            <section>
              <h2 className="prefs-h">ホットキー</h2>
              <table className="shortcut-table">
                <tbody>
                  {SHORTCUTS.map(s => (
                    <tr key={s.keys}>
                      <td className="shortcut-keys">{s.keys}</td>
                      <td>{s.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="prefs-note">Web 版ではキーの割り当ては変えられません。ブラウザが先に使うキー（⌘/Ctrl+T・W など）と重ならないよう固定しています。</p>
            </section>
          )}

          {tab === 'UI' && (
            <section>
              <h2 className="prefs-h">全般</h2>
              <Row label="インターフェーステーマ">
                <select
                  value={config.ui.theme}
                  onChange={e => set('ui', { theme: e.target.value as ThemeName })}
                >
                  <optgroup label="暗いテーマ">
                    {darkThemes.map(t => (
                      <option key={t} value={t}>
                        {THEMES[t].label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="明るいテーマ">
                    {lightThemes.map(t => (
                      <option key={t} value={t}>
                        {THEMES[t].label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </Row>

              <h2 className="prefs-h">エディタ — Markdownを書き込む側のペイン</h2>
              <Row label="エディタのフォント">
                <FontInput
                  value={config.editor.fontFamily}
                  placeholder="空欄で OS の等幅フォント"
                  onCommit={v => set('editor', { fontFamily: v })}
                />
              </Row>
              <Row label="エディタのフォントサイズ">
                <SizeInput value={config.editor.fontSize} onCommit={v => set('editor', { fontSize: v })} />
              </Row>
              <Row label="エディタのインデント方法">
                <select
                  value={config.editor.indentType}
                  onChange={e => set('editor', { indentType: e.target.value as 'space' | 'tab' })}
                >
                  <option value="space">スペース</option>
                  <option value="tab">タブ</option>
                </select>
                <select
                  value={config.editor.indentSize}
                  aria-label="インデントの幅"
                  onChange={e =>
                    set('editor', { indentSize: Number(e.target.value) as Config['editor']['indentSize'] })
                  }
                >
                  {INDENT_SIZES.map(n => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Row>
              <Check
                label="エディタ内に行番号を表示"
                checked={config.editor.displayLineNumbers}
                onChange={v => set('editor', { displayLineNumbers: v })}
              />
              <Check
                label="エディタが最終行以降にスクロールできるようにする"
                checked={config.editor.scrollPastEnd}
                onChange={v => set('editor', { scrollPastEnd: v })}
              />

              <h2 className="prefs-h">プレビュー</h2>
              <Row label="プレビュー時フォント">
                <FontInput
                  value={config.preview.fontFamily}
                  placeholder="空欄で画面と同じフォント"
                  onCommit={v => set('preview', { fontFamily: v })}
                />
              </Row>
              <Row label="プレビュー時フォントサイズ">
                <SizeInput value={config.preview.fontSize} onCommit={v => set('preview', { fontSize: v })} />
              </Row>
              <Check
                label="Markdown 中の改行でプレビューも改行する"
                checked={config.preview.breaks}
                onChange={v => set('preview', { breaks: v })}
              />

              <div className="prefs-actions">
                <button className="btn-ghost-inline" onClick={() => onChange(DEFAULT_CONFIG)}>
                  既定に戻す
                </button>
              </div>
            </section>
          )}

          {tab === 'INFO' && (
            <section>
              <h2 className="prefs-h">BoostRecord について</h2>
              <p>BoostRecord の Web 版です。ノートはこのブラウザの中か、選んだフォルダにだけ保存し、外部のサーバーへは送りません。AI など外部へ接続する機能はデスクトップ版だけにあります。</p>
              <p>
                ソースコードとデスクトップ版:{' '}
                <a href="https://github.com/BoxPistols/BoostRecord" target="_blank" rel="noreferrer">
                  github.com/BoxPistols/BoostRecord
                </a>
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="prefs-row">
      <span className="prefs-label">{label}</span>
      <span className="prefs-control">{children}</span>
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="prefs-check">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

// 打ちかけの値で画面が揺れないよう、離れたとき（または Enter）に当てる
function FontInput({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => onCommit(draft.trim())}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) onCommit(draft.trim())
      }}
    />
  )
}

function SizeInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  return (
    <input
      type="number"
      min={FONT_SIZE.min}
      max={FONT_SIZE.max}
      value={value}
      onChange={e => {
        const n = Number(e.target.value)
        if (Number.isFinite(n) && n >= FONT_SIZE.min && n <= FONT_SIZE.max) onCommit(Math.round(n))
      }}
    />
  )
}

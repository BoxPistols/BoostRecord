/**
 * @fileoverview Vim キーマップの早見表。
 *
 * 環境設定でエディタのキーマップに vim を選べるが、どのキーが使えるのかを
 * 示す場所がどこにも無かった。選んだ本人が忘れると、エディタが「文字を
 * 入力できない壊れた状態」に見えてしまう（ノーマルモードに居るだけ）。
 *
 * CodeMirror の vim アドオン（keymap/vim.js）が実装している範囲のうち、
 * 日常的に使うものだけを載せる。網羅は目的にしない。
 */
import PropTypes from 'prop-types'
import React from 'react'
import i18n from 'browser/lib/i18n'

// [キー, 説明キー] の並び。説明は i18n を通す
const SECTIONS = [
  {
    title: 'Modes',
    keys: [
      ['Esc', 'Back to normal mode'],
      ['i', 'Insert before the cursor'],
      ['a', 'Insert after the cursor'],
      ['o', 'Open a new line below'],
      ['v', 'Visual mode'],
      ['V', 'Visual line mode']
    ]
  },
  {
    title: 'Move',
    keys: [
      ['h j k l', 'Left / down / up / right'],
      ['w  b', 'Next / previous word'],
      ['0  $', 'Start / end of line'],
      ['gg  G', 'Start / end of document'],
      ['Ctrl+d  Ctrl+u', 'Half page down / up'],
      ['{  }', 'Previous / next paragraph']
    ]
  },
  {
    title: 'Edit',
    keys: [
      ['x', 'Delete the character'],
      ['dd', 'Delete the line'],
      ['dw', 'Delete the word'],
      ['yy  p', 'Copy the line / paste'],
      ['u  Ctrl+r', 'Undo / redo'],
      ['.', 'Repeat the last change']
    ]
  },
  {
    title: 'Search',
    keys: [
      ['/text', 'Search forward'],
      ['n  N', 'Next / previous match'],
      [':%s/a/b/g', 'Replace all']
    ]
  }
]

const VimKeyReference = ({ compact }) => (
  <div>
    <p>
      <strong>{i18n.__('Vim keymap is enabled')}</strong>{' '}
      {i18n.__(
        'The editor starts in normal mode — press i to type. Esc returns to normal mode.'
      )}
    </p>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: compact
          ? '1fr'
          : 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px 24px'
      }}
    >
      {SECTIONS.map(section => (
        <div key={section.title}>
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
            {i18n.__(section.title)}
          </p>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {section.keys.map(([keys, desc]) => (
              <li
                key={keys}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'baseline',
                  lineHeight: '1.7'
                }}
              >
                {/* キーは等幅・固定幅で左に揃える。説明の頭が揃わないと
                    一覧として読みにくい */}
                <code style={{ flex: '0 0 108px', whiteSpace: 'nowrap' }}>
                  {keys}
                </code>
                <span style={{ flex: 1, minWidth: 0 }}>{i18n.__(desc)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  </div>
)

VimKeyReference.propTypes = {
  // 狭い場所では1列に積む
  compact: PropTypes.bool
}

export default VimKeyReference

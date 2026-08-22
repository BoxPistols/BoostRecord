import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './TocPane.styl'
import i18n from 'browser/lib/i18n'
import { extractHeadings } from 'browser/lib/markdownHeadings'

/**
 * 見出しのページ内リンク一覧（目次）。
 *
 * ジャンプは slug ではなく **行番号** で行う。slug は生成規則が少しでも
 * ずれると静かに一致しなくなり、「押しても何も起きない」形で壊れるため。
 * プレビュー側は data-line を持っているので行番号で引ける。
 */
const TocPane = ({ content, config, onJump, onClose }) => {
  const preview = (config && config.preview) || {}
  const headings = extractHeadings(content, {
    minLevel: preview.tocMinLevel,
    maxLevel: preview.tocMaxLevel
  })

  // 一番浅い見出しを基準にインデントする。H2 から始まる文書で
  // 全部がぶら下がって見えるのを防ぐ
  const baseLevel = headings.reduce(
    (min, h) => Math.min(min, h.level),
    Number.MAX_SAFE_INTEGER
  )

  return (
    <div styleName='root' className='TocPane'>
      <div styleName='header'>
        <span styleName='title'>{i18n.__('Outline')}</span>
        <button
          styleName='close'
          onClick={onClose}
          title={i18n.__('Hide Outline')}
          aria-label={i18n.__('Hide Outline')}
        >
          <i className='fa fa-times' aria-hidden='true' />
        </button>
      </div>
      {headings.length === 0 ? (
        <div styleName='empty'>{i18n.__('No headings in this note')}</div>
      ) : (
        <ul styleName='list'>
          {headings.map(heading => (
            <li key={`${heading.line}-${heading.text}`}>
              <button
                styleName='item'
                style={{ paddingLeft: 10 + (heading.level - baseLevel) * 12 }}
                title={heading.text}
                onClick={() => onJump(heading.line)}
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

TocPane.propTypes = {
  content: PropTypes.string,
  config: PropTypes.object.isRequired,
  onJump: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
}

export default CSSModules(TocPane, styles)

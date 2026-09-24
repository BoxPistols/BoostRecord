import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import paneStyles from './SuggestionsPane.styl'
import dupStyles from './DuplicatesPane.styl'
import i18n from 'browser/lib/i18n'

// 枠・見出し・カードは改善提案のペインと同じ見た目にする。重複用のクラスを先に引き、
// 無ければ改善提案側から引く（Object.assignだと、テストで使うProxyのスタイルはキーを持たず空になる）
const styles = new Proxy(
  {},
  {
    get: (target, key) => (key in dupStyles ? dupStyles[key] : paneStyles[key])
  }
)

// 箇所の見せる長さ。長い段落は先頭だけ
const SNIPPET_CHARS = 120

function snippet(text) {
  return text.length > SNIPPET_CHARS ? `${text.slice(0, SNIPPET_CHARS)}…` : text
}

/**
 * 重複の一覧。完全一致は端末内ですぐに、意味の重複はAIの応答が届いてから並べる。
 * 本文は書き換えず、各箇所へ移動するだけ。検出と移動は親が持つ
 */
class DuplicatesPane extends React.Component {
  renderGroup(group, index) {
    const exact = group.kind === 'exact'
    return (
      <div key={`${group.kind}-${index}`} styleName='card'>
        <div styleName='card-head'>
          <span styleName={exact ? 'chip--exact' : 'chip--semantic'}>
            {exact ? i18n.__('Exact match') : i18n.__('Same meaning')}
          </span>
          <span styleName='card-state'>
            {i18n.__('%s places', String(group.occurrences.length))}
          </span>
        </div>
        {!exact && group.reason && <p styleName='card-why'>{group.reason}</p>}
        <div styleName='occurrences'>
          {group.occurrences.map(o => (
            <div key={o.start} styleName='occurrence'>
              <span styleName='occurrence-line'>
                {i18n.__('Line %s', String(o.line + 1))}
              </span>
              <span styleName='occurrence-text'>{snippet(o.text)}</span>
              <button
                type='button'
                styleName='occurrence-jump'
                onClick={() => this.props.onLocate(o)}
              >
                {i18n.__('Go')}
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  render() {
    const {
      exactGroups,
      semanticGroups,
      semanticState,
      semanticError,
      onRun,
      onClose
    } = this.props
    const total = exactGroups.length + semanticGroups.length
    const semanticRunning = semanticState === 'running'

    return (
      <div styleName='root' className='DuplicatesPane'>
        <div styleName='header'>
          <span styleName='title'>
            {i18n.__('Duplicates')}
            {total > 0 && <span styleName='title-count'>{total}</span>}
          </span>
          <button
            styleName='close'
            onClick={onClose}
            title={i18n.__('Hide duplicates')}
            aria-label={i18n.__('Hide duplicates')}
          >
            <i className='fa fa-times' aria-hidden='true' />
          </button>
        </div>

        <div styleName='run'>
          <div styleName='run-scope'>
            {i18n.__('Target')}: {i18n.__('Whole note')}
          </div>
          <button
            type='button'
            styleName='run-button'
            disabled={semanticRunning}
            onClick={onRun}
          >
            {i18n.__('Check again')}
          </button>
        </div>

        <div styleName='list'>
          <div styleName='section'>{i18n.__('Exact match')}</div>
          {exactGroups.length === 0 ? (
            <div styleName='empty'>{i18n.__('No exact duplicates.')}</div>
          ) : (
            exactGroups.map((g, i) => this.renderGroup(g, i))
          )}

          <div styleName='section'>{i18n.__('Same meaning (AI)')}</div>
          {semanticRunning ? (
            <div styleName='empty' aria-busy='true'>
              {i18n.__('Asking the AI about passages with the same meaning…')}
              <div styleName='skeleton' aria-hidden='true'>
                <div styleName='skeleton-line' />
                <div styleName='skeleton-line' />
                <div styleName='skeleton-line' />
              </div>
            </div>
          ) : semanticError ? (
            <div styleName='error'>{semanticError}</div>
          ) : semanticGroups.length === 0 ? (
            <div styleName='empty'>
              {semanticState === 'done'
                ? i18n.__('No passages with the same meaning.')
                : ''}
            </div>
          ) : (
            semanticGroups.map((g, i) => this.renderGroup(g, i))
          )}
        </div>
      </div>
    )
  }
}

DuplicatesPane.propTypes = {
  exactGroups: PropTypes.array.isRequired,
  semanticGroups: PropTypes.array.isRequired,
  /** 'idle' | 'running' | 'done' | 'error' */
  semanticState: PropTypes.string,
  semanticError: PropTypes.string,
  onRun: PropTypes.func.isRequired,
  onLocate: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
}

export default CSSModules(DuplicatesPane, styles)

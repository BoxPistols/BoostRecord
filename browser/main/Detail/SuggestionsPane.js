import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './SuggestionsPane.styl'
import i18n from 'browser/lib/i18n'
import { SUGGESTION_TYPES } from 'browser/main/lib/aiSuggest'

// 種類の表示名（Draftline と同じ区分）
export const TYPE_LABELS = {
  grammar: 'Grammar',
  spelling: 'Spelling',
  punctuation: 'Punctuation',
  style: 'Style',
  clarity: 'Clarity',
  'ai-writing': 'AI writing'
}

/**
 * 改善提案のペイン。目次と同じ右の列に出す。
 * 1 件ずつ「適用」「却下」、種類で絞り込み、残りを「全部適用」。
 * 提案の中身（どこを・どう・なぜ）は親が持ち、ここは表示と操作だけ。
 */
class SuggestionsPane extends React.Component {
  constructor(props) {
    super(props)
    this.state = { custom: '' }
  }

  handleAnalyze() {
    if (this.props.analyzing) return
    this.props.onAnalyze(this.state.custom)
  }

  handleCustomKeyDown(e) {
    if (e.nativeEvent && e.nativeEvent.isComposing) return
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      this.handleAnalyze()
    }
  }

  renderCard(s) {
    const done = s.status !== 'pending'
    const missing = s.status === 'missing'
    return (
      <div
        key={s.id}
        styleName={done ? 'card--done' : 'card'}
        data-suggestion-id={s.id}
      >
        <div styleName='card-head'>
          <span styleName={`chip chip--${s.type}`}>
            {i18n.__(TYPE_LABELS[s.type] || s.type)}
          </span>
          {done && (
            <span styleName='card-state'>
              {s.status === 'accepted'
                ? i18n.__('Applied')
                : missing
                ? i18n.__('Not found in the text')
                : i18n.__('Dismissed')}
            </span>
          )}
        </div>
        {s.explanation && <p styleName='card-why'>{s.explanation}</p>}
        <div styleName='card-diff'>
          <span styleName='card-before'>{s.original}</span>
          <span styleName='card-arrow'>→</span>
          <span styleName='card-after'>
            {s.suggestion || i18n.__('(delete)')}
          </span>
        </div>
        {!done && (
          <div styleName='card-actions'>
            <button
              type='button'
              styleName='accept'
              onClick={() => this.props.onApply(s)}
              onMouseEnter={() => this.props.onHover && this.props.onHover(s)}
              onMouseLeave={() =>
                this.props.onHover && this.props.onHover(null)
              }
            >
              <i className='fa fa-check' aria-hidden='true' />{' '}
              {i18n.__('Apply')}
            </button>
            <button
              type='button'
              styleName='reject'
              onClick={() => this.props.onDismiss(s)}
            >
              <i className='fa fa-times' aria-hidden='true' />{' '}
              {i18n.__('Dismiss')}
            </button>
            <button
              type='button'
              styleName='locate'
              onClick={() => this.props.onLocate && this.props.onLocate(s)}
              title={i18n.__('Show in the editor')}
              aria-label={i18n.__('Show in the editor')}
            >
              <i className='fa fa-crosshairs' aria-hidden='true' />
            </button>
          </div>
        )}
      </div>
    )
  }

  render() {
    const {
      suggestions,
      analyzing,
      error,
      category,
      onCategory,
      onApplyAll,
      onClose,
      scopeLabel
    } = this.props
    const filtered =
      category === 'all'
        ? suggestions
        : suggestions.filter(s => s.type === category)
    const pending = filtered.filter(s => s.status === 'pending')
    const totalPending = suggestions.filter(s => s.status === 'pending').length
    const counts = {}
    suggestions.forEach(s => {
      counts[s.type] = (counts[s.type] || 0) + 1
    })

    return (
      <div styleName='root' className='SuggestionsPane'>
        <div styleName='header'>
          <span styleName='title'>
            {i18n.__('Suggestions')}
            {suggestions.length > 0 && (
              <span styleName='title-count'>
                {totalPending}/{suggestions.length}
              </span>
            )}
          </span>
          <button
            styleName='close'
            onClick={onClose}
            title={i18n.__('Hide suggestions')}
            aria-label={i18n.__('Hide suggestions')}
          >
            <i className='fa fa-times' aria-hidden='true' />
          </button>
        </div>

        <div styleName='run'>
          <div styleName='run-scope'>
            {i18n.__('Target')}: {scopeLabel}
          </div>
          <textarea
            styleName='run-custom'
            rows={2}
            value={this.state.custom}
            placeholder={i18n.__(
              'Optional instruction, e.g. use polite form, keep it casual'
            )}
            onChange={e => this.setState({ custom: e.target.value })}
            onKeyDown={e => this.handleCustomKeyDown(e)}
          />
          <button
            type='button'
            styleName='run-button'
            disabled={analyzing}
            onClick={() => this.handleAnalyze()}
          >
            <i
              className={analyzing ? 'fa fa-spinner fa-spin' : 'fa fa-magic'}
              aria-hidden='true'
            />{' '}
            {analyzing ? i18n.__('Analyzing…') : i18n.__('Analyze')}
          </button>
        </div>

        {error && <div styleName='error'>{error}</div>}

        {suggestions.length > 0 && (
          <div styleName='filters'>
            <button
              type='button'
              styleName={category === 'all' ? 'filter--active' : 'filter'}
              onClick={() => onCategory('all')}
            >
              {i18n.__('All')} {suggestions.length}
            </button>
            {SUGGESTION_TYPES.filter(t => counts[t]).map(t => (
              <button
                key={t}
                type='button'
                styleName={category === t ? 'filter--active' : 'filter'}
                onClick={() => onCategory(t)}
              >
                {i18n.__(TYPE_LABELS[t])} {counts[t]}
              </button>
            ))}
          </div>
        )}

        <div styleName='list'>
          {suggestions.length === 0 ? (
            <div styleName='empty'>
              {analyzing
                ? i18n.__('Reading the text…')
                : i18n.__(
                    'Press Analyze. Each suggestion shows where, what, and why. Apply them one by one, or all at once.'
                  )}
            </div>
          ) : filtered.length === 0 ? (
            <div styleName='empty'>
              {i18n.__('No suggestions in this category')}
            </div>
          ) : (
            filtered.map(s => this.renderCard(s))
          )}
        </div>

        {pending.length > 0 && (
          <div styleName='footer'>
            <button
              type='button'
              styleName='apply-all'
              onClick={() => onApplyAll(pending)}
            >
              <i className='fa fa-check-square-o' aria-hidden='true' />{' '}
              {i18n.__('Apply all %s', String(pending.length))}
            </button>
          </div>
        )}
      </div>
    )
  }
}

SuggestionsPane.propTypes = {
  suggestions: PropTypes.array.isRequired,
  analyzing: PropTypes.bool,
  error: PropTypes.string,
  category: PropTypes.string.isRequired,
  scopeLabel: PropTypes.string,
  onCategory: PropTypes.func.isRequired,
  onAnalyze: PropTypes.func.isRequired,
  onApply: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
  onApplyAll: PropTypes.func.isRequired,
  onLocate: PropTypes.func,
  onHover: PropTypes.func,
  onClose: PropTypes.func.isRequired
}

export default CSSModules(SuggestionsPane, styles)

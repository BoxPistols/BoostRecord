/**
* @fileoverview Micro component for showing TagList.
*/
import React, { PropTypes } from 'react'
import styles from './TagListItem.styl'
import CSSModules from 'browser/lib/CSSModules'

/**
* @param {string} name
* @param {Function} handleClickTagListItem
*/

const TagListItem = ({name, handleClickTagListItem}) => (
  <button styleName='tagList-item' onClick={() => handleClickTagListItem(name)}>
    <span styleName='tagList-item-name'>
      {`# ${name}`}
    </span>
  </button>
)

TagListItem.propTypes = {
  name: PropTypes.string.isRequired,
  handleClickTagListItem: PropTypes.func.isRequired
}

export default CSSModules(TagListItem, styles)

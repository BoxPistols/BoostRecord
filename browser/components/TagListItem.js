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

const TagListItem = ({name, handleClickTagListItem}) => {
  return (
    <button styleName='tagList-item' onClick={(e) => handleClickTagListItem(e, name)}>
      <span styleName='tagList-item-name'>
        {`# ${name}`}
      </span>
    </button>
  )
}

export default CSSModules(TagListItem, styles)


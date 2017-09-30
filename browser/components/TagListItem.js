/**
* @fileoverview Micro component for showing TagList.
*/
import React, { PropTypes } from 'react'
import styles from './TagListItem.styl'
import CSSModules from 'browser/lib/CSSModules'

/**
* @param {string} name
* @param (Function) handleClickTagButton
*/

const TagListItem = ({name, handleClickTagButton}) => {
  return (
    <button styleName='tagList-item' onClick={(e) => handleClickTagButton(e, name)}>
      <span styleName='tagList-item-name'>
        {`# ${name}`}
      </span>
    </button>
  )
}

export default CSSModules(TagListItem, styles)


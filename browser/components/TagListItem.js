/**
* @fileoverview Micro component for showing TagList.
*/
import React, { PropTypes } from 'react'
import styles from './TagListItem.styl'
import CSSModules from 'browser/lib/CSSModules'

/**
* @param {string} name
*/

const TagListItem = (({name}) => {
  return (
    <button>
      {name}
    </button>
  )
})

export default CSSModules(TagListItem, styles)


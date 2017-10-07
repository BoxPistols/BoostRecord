/**
* @fileoverview Micro component for showing StorageList
*/
import React, { PropTypes } from 'react'
import styles from './StorgaeList.styl'
import CSSModules from 'browser/lib/CSSModules'

/**
* @param {Array} storgaeList
*/

const StorageList = ({storageList}) => (
  <div styleName='storageList'>
    {storageList.length > 0 ? storageList : (
      <div styleName='storgaeList-empty'>No storage mount.</div>
    )}
  </div>
)

StorageList.propTypes = {
  storgaeList: PropTypes.arrayOf.isRequired
}
export default CSSModules(StorageList, styles)

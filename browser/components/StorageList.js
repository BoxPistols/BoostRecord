/**
 * @fileoverview Micro component for showing StorageList
 */
import PropTypes from 'prop-types'
import React from 'react'
import i18n from 'browser/lib/i18n'
import styles from './StorageList.styl'
import CSSModules from 'browser/lib/CSSModules'

/**
 * @param {Array} storageList
 */

const StorageList = ({ storageList, isFolded }) => (
  <div styleName={isFolded ? 'storageList-folded' : 'storageList'}>
    {storageList.length > 0 ? (
      storageList
    ) : (
      <div styleName='storageList-empty'>{i18n.__('No storage mount.')}</div>
    )}
  </div>
)

StorageList.propTypes = {
  storageList: PropTypes.arrayOf(PropTypes.element).isRequired
}
export default CSSModules(StorageList, styles)

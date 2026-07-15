import PropTypes from 'prop-types'
import React from 'react'
import ImageManagerModal from 'browser/main/modals/ImageManagerModal'

const ImagesTab = ({ data }) => {
  const storageList = Object.values(data.storageMap.toJS())
  return (
    <div style={{ overflowX: 'hidden', overflowY: 'auto', height: '100%' }}>
      <ImageManagerModal storageList={storageList} />
    </div>
  )
}

ImagesTab.propTypes = {
  data: PropTypes.object.isRequired
}

export default ImagesTab

import React, { PropTypes } from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './SideNav.styl'
import { openModal } from 'browser/main/lib/modal'
import PreferencesModal from '../modals/PreferencesModal'
import ConfigManager from 'browser/main/lib/ConfigManager'
import StorageItem from './StorageItem'
import TagListItem from 'browser/components/TagListItem'
import SideNavFilter from 'browser/components/SideNavFilter'

class SideNav extends React.Component {
  // TODO: should not use electron stuff v0.7
  handleMenuButtonClick (e) {
    openModal(PreferencesModal)
  }

  handleHomeButtonClick (e) {
    let { router } = this.context
    router.push('/home')
  }

  handleStarredButtonClick (e) {
    let { router } = this.context
    router.push('/starred')
  }

  handleToggleButtonClick (e) {
    let { dispatch, config } = this.props

    ConfigManager.set({isSideNavFolded: !config.isSideNavFolded})
    dispatch({
      type: 'SET_IS_SIDENAV_FOLDED',
      isFolded: !config.isSideNavFolded
    })
  }

  handleTrashedButtonClick (e) {
    let { router } = this.context
    router.push('/trashed')
  }

  handleSwitchFoldersButtonClick (e) {
    let { router } = this.context
    router.push('/home')
  }

  handleSwitchTagsButtonClick (e) {
    let { router } = this.context
    router.push('/alltags')
  }

  SideNavComponent (isFolded, isHomeActive, isStarredActive, isTrashedActive, storageList) {
    let { location, data } = this.props
    let component
    if (!location.pathname.match('/tags') && !location.pathname.match('/alltags')) {
      component = (
        <div>
          <SideNavFilter
            isFolded={isFolded}
            isHomeActive={isHomeActive}
            handleAllNotesButtonClick={(e) => this.handleHomeButtonClick(e)}
            isStarredActive={isStarredActive}
            isTrashedActive={isTrashedActive}
            handleStarredButtonClick={(e) => this.handleStarredButtonClick(e)}
            handleTrashedButtonClick={(e) => this.handleTrashedButtonClick(e)}
          />

          <div styleName='storageList'>
            {storageList.length > 0 ? storageList : (
              <div styleName='storageList-empty'>No storage mount.</div>
            )}
          </div>
          <button styleName='navToggle'
            onClick={(e) => this.handleToggleButtonClick(e)}
          >
            {isFolded
              ? <i className='fa fa-angle-double-right' />
              : <i className='fa fa-angle-double-left' />
            }
          </button>
        </div>
      )
    } else {
      component = (
        <div>
          <div styleName='tag-title'>
            <p>Tags</p>
          </div>
          <div styleName='tagList'>
            {this.tagListComponent(data)}
          </div>
        </div>
      )
    }

    return component
  }

  tagListComponent (data) {
    let tagList = data.tagNoteMap.map((tag, key) => {
      return key
    })
    return (
      tagList.map(tag => {
        return (<TagListItem
          name={tag}
          handleClickTagListItem={this.handleClickTagListItem.bind(this)}
          key={tag}
        />
        )
      })
    )
  }

  handleClickTagListItem (e, name) {
    let { router } = this.context
    router.push(`/tags/${name}`)
  }

  render () {
    let { data, location, config, dispatch } = this.props

    let isFolded = config.isSideNavFolded
    let isHomeActive = !!location.pathname.match(/^\/home$/)
    let isStarredActive = !!location.pathname.match(/^\/starred$/)
    let isTrashedActive = !!location.pathname.match(/^\/trashed$/)

    let storageList = data.storageMap.map((storage, key) => {
      return <StorageItem
        key={storage.key}
        storage={storage}
        data={data}
        location={location}
        isFolded={isFolded}
        dispatch={dispatch}
      />
    })
    let style = {}
    if (!isFolded) style.width = this.props.width
    return (
      <div className='SideNav'
        styleName={isFolded ? 'root--folded' : 'root'}
        tabIndex='1'
        style={style}
      >
        <div styleName='top'>
          <div styleName='switch-buttons'>
            <button styleName={location.pathname.match(/tag/) ? 'non-active-button' : 'active-button'} onClick={(e) => this.handleSwitchFoldersButtonClick(e)}>Folders</button>
            <button styleName={location.pathname.match(/tag/) ? 'active-button' : 'non-active-button'} onClick={(e) => this.handleSwitchTagsButtonClick(e)}>Tags</button>
          </div>
          <button styleName='top-menu'
            onClick={(e) => this.handleMenuButtonClick(e)}
          >
            <i className='fa fa-wrench fa-fw' />
          </button>
        </div>
        {this.SideNavComponent(isFolded, isHomeActive, isTrashedActive, isStarredActive, storageList)}
      </div>
    )
  }
}

SideNav.contextTypes = {
  router: PropTypes.shape({})
}

SideNav.propTypes = {
  dispatch: PropTypes.func,
  storages: PropTypes.array,
  config: PropTypes.shape({
    isSideNavFolded: PropTypes.bool
  }),
  location: PropTypes.shape({
    pathname: PropTypes.string
  })
}

export default CSSModules(SideNav, styles)

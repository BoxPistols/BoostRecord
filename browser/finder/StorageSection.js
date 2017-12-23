import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './StorageSection.styl'
import StorageItem from 'browser/components/StorageItem'

class StorageSection extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      isOpen: true
    }
  }

  handleToggleButtonClick (e) {
    this.setState({
      isOpen: !this.state.isOpen
    })
  }

  handleHeaderClick (e) {
    const { storage } = this.props
    this.props.handleStorageButtonClick(e, storage.key)
  }

  handleFolderClick (e, folder) {
    const { storage } = this.props
    this.props.handleFolderButtonClick(e, storage.key, folder.key)
  }

  render () {
    const { storage, filter } = this.props
    const folderList = storage.folders
      .map(folder => (
        <StorageItem
          key={folder.key}
          isActive={filter.type === 'FOLDER' && filter.folder === folder.key && filter.storage === storage.key}
          handleButtonClick={(e) => this.handleFolderClick(e, folder)}
          folderName={folder.name}
          folderColor={folder.color}
          isFolded={false}
        />
      ))

    return (
      <div styleName='root'>
        <div styleName='header'>
          <button styleName='header-toggleButton'
            onClick={(e) => this.handleToggleButtonClick(e)}
          >
            <i className={this.state.isOpen
                ? 'fa fa-caret-down'
                : 'fa fa-caret-right'
              }
            />
          </button>
          <button styleName={filter.type === 'STORAGE' && filter.storage === storage.key
              ? 'header-name--active'
              : 'header-name'
            }
            onClick={(e) => this.handleHeaderClick(e)}
          >{storage.name}</button>
        </div>
        {this.state.isOpen &&
          <div styleName='folderList'>
            {folderList}
          </div>
        }
      </div>
    )
  }
}

StorageSection.propTypes = {
}

export default CSSModules(StorageSection, styles)

import PropTypes from 'prop-types'
import React from 'react'
import CSSModules from 'browser/lib/CSSModules'
import styles from './StatusBar.styl'
import ZoomManager from 'browser/main/lib/ZoomManager'
import i18n from 'browser/lib/i18n'
import context from 'browser/lib/context'
import EventEmitter from 'browser/main/lib/eventEmitter'

const electron = require('electron')
const { ipcRenderer } = electron

const zoomOptions = [
  0.8,
  0.9,
  1,
  1.1,
  1.2,
  1.3,
  1.4,
  1.5,
  1.6,
  1.7,
  1.8,
  1.9,
  2.0
]

class StatusBar extends React.Component {
  constructor(props) {
    super(props)
    this.handleZoomInMenuItem = this.handleZoomInMenuItem.bind(this)
    this.handleZoomOutMenuItem = this.handleZoomOutMenuItem.bind(this)
    this.handleZoomResetMenuItem = this.handleZoomResetMenuItem.bind(this)
  }

  componentDidMount() {
    EventEmitter.on('status:zoomin', this.handleZoomInMenuItem)
    EventEmitter.on('status:zoomout', this.handleZoomOutMenuItem)
    EventEmitter.on('status:zoomreset', this.handleZoomResetMenuItem)
  }

  componentWillUnmount() {
    EventEmitter.off('status:zoomin', this.handleZoomInMenuItem)
    EventEmitter.off('status:zoomout', this.handleZoomOutMenuItem)
    EventEmitter.off('status:zoomreset', this.handleZoomResetMenuItem)
  }

  // 手で確かめたのと同じ扱いにして、更新の方法によらず確認のダイアログを出す
  // （lib/app-updater.js）。開き直す前に聞かないと、押し間違いで画面が閉じる
  updateApp() {
    ipcRenderer.send('update-check', 'manual')
  }

  handleZoomButtonClick(e) {
    const templates = []

    zoomOptions.forEach(zoom => {
      templates.push({
        label: Math.floor(zoom * 100) + '%',
        click: () => this.handleZoomMenuItemClick(zoom)
      })
    })

    context.popup(templates)
  }

  handleZoomMenuItemClick(zoomFactor) {
    const { dispatch } = this.props
    ZoomManager.setZoom(zoomFactor)
    dispatch({
      type: 'SET_ZOOM',
      zoom: zoomFactor
    })
  }

  handleZoomInMenuItem() {
    const zoomFactor = ZoomManager.getZoom() + 0.1
    this.handleZoomMenuItemClick(zoomFactor)
  }

  handleZoomOutMenuItem() {
    const zoomFactor = ZoomManager.getZoom() - 0.1
    this.handleZoomMenuItemClick(zoomFactor)
  }

  handleZoomResetMenuItem() {
    this.handleZoomMenuItemClick(1.0)
  }

  render() {
    const { config, status } = this.context

    return (
      <div className='StatusBar' styleName='root'>
        <button styleName='zoom' onClick={e => this.handleZoomButtonClick(e)}>
          <img src='../resources/icon/icon-zoom.svg' />
          <span>{Math.floor(config.zoom * 100)}%</span>
        </button>

        {status.updateReady ? (
          <button
            onClick={this.updateApp}
            styleName='update'
            disabled={!!status.updateBusy}
            title={status.updateError || undefined}
          >
            <i styleName='update-icon' className='fa fa-cloud-download' />{' '}
            {status.updateBusy
              ? i18n.__('Preparing the update…')
              : status.updateVersion
              ? i18n.__('Update to %s', status.updateVersion)
              : i18n.__('Ready to Update!')}
            {status.updateError && !status.updateBusy
              ? ' ' + i18n.__('(will retry later)')
              : null}
          </button>
        ) : null}
      </div>
    )
  }
}

StatusBar.contextTypes = {
  status: PropTypes.shape({
    updateReady: PropTypes.bool.isRequired
  }).isRequired,
  config: PropTypes.shape({}).isRequired,
  date: PropTypes.string
}

StatusBar.propTypes = {
  config: PropTypes.shape({
    zoom: PropTypes.number
  })
}

export default CSSModules(StatusBar, styles)

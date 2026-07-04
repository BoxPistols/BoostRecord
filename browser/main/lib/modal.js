import React from 'react'
import { Provider } from 'react-redux'
import ReactDOM from 'react-dom'
import { store } from '../store'

// CSS-module class names differ per bundler (the old webpack selector
// '.NoteList__list___…' matches nothing under Vite), so locate NoteList's
// scroller by a stable data attribute — and never let a missing element
// block opening/closing the modal.
function setNoteListOverflow(value) {
  const list = document.querySelector('[data-note-list]')
  if (list != null) list.style.overflow = value
}

class ModalBase extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      component: null,
      componentProps: {},
      isHidden: true
    }
  }

  close() {
    if (modalBase != null)
      modalBase.setState({
        component: null,
        componentProps: null,
        isHidden: true
      })
    setNoteListOverflow('auto')
  }

  render() {
    return (
      <div className={'ModalBase' + (this.state.isHidden ? ' hide' : '')}>
        <div onClick={e => this.close(e)} className='modalBack' />
        {this.state.component == null ? null : (
          <Provider store={store}>
            <this.state.component
              {...this.state.componentProps}
              close={this.close}
            />
          </Provider>
        )}
      </div>
    )
  }
}

const el = document.createElement('div')
document.body.appendChild(el)
let modalBase
ReactDOM.render(<ModalBase ref={c => (modalBase = c)} />, el)

export function openModal(component, props) {
  if (modalBase == null) {
    return
  }
  // Hide scrollbar by removing overflow when modal opens
  setNoteListOverflow('hidden')
  document.body.setAttribute('data-modal', 'open')
  modalBase.setState({
    component: component,
    componentProps: props,
    isHidden: false
  })
}

export function closeModal() {
  if (modalBase == null) {
    return
  }
  modalBase.close()
}

export function isModalOpen() {
  return !modalBase.state.isHidden
}

export default {
  open: openModal,
  close: closeModal,
  isOpen: isModalOpen
}

import React from 'react'
import NoteItem from 'browser/components/NoteItem'
import moment from 'moment'

class NoteList extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      range: 0
    }
  }

  componentWillReceiveProps (nextProps) {
    if (this.props.search !== nextProps.search) {
      this.resetScroll()
    }
  }

  componentDidUpdate () {
    const { index } = this.props

    if (index > -1) {
      const list = this.refs.root
      const item = list.childNodes[index]
      if (item == null) return null

      const overflowBelow = item.offsetTop + item.clientHeight - list.clientHeight - list.scrollTop > 0
      if (overflowBelow) {
        list.scrollTop = item.offsetTop + item.clientHeight - list.clientHeight
      }
      const overflowAbove = list.scrollTop > item.offsetTop
      if (overflowAbove) {
        list.scrollTop = item.offsetTop
      }
    }
  }

  resetScroll () {
    this.refs.root.scrollTop = 0
    this.setState({
      range: 0
    })
  }

  handleScroll (e) {
    const { notes } = this.props

    if (e.target.offsetHeight + e.target.scrollTop > e.target.scrollHeight - 100 && notes.length > this.state.range * 10 + 10) {
      this.setState({
        range: this.state.range + 1
      })
    }
  }

  render () {
    const { notes, index } = this.props

    const notesList = notes
      .slice(0, 10 + 10 * this.state.range)
      .map((note, _index) => {
        const isActive = (index === _index)
        const key = `${note.storage}-${note.key}`
        const dateDisplay = moment(note.updatedAt).fromNow()

        return (
          <NoteItem
            isActive={isActive}
            note={note}
            dateDisplay={dateDisplay}
            key={key}
            handleNoteClick={(e) => this.props.handleNoteClick(e, _index)}
          />
        )
      })
    return (
      <div className={this.props.className}
        onScroll={(e) => this.handleScroll(e)}
        ref='root'
      >
        {notesList}
      </div>
    )
  }
}

NoteList.propTypes = {
}

export default NoteList

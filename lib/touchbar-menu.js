const {TouchBar} = require('electron')
const {TouchBarButton, TouchBarSpacer} = TouchBar

const allNotes = new TouchBarButton({
  label: '📒',
  click: () => {}
})

const starredNotes = new TouchBarButton({
  label: '⭐️',
  click: () => {}
})

const trash = new TouchBarButton({
  label: '🗑',
  click: () => {}
})

module.exports = new TouchBar([
  allNotes,
  new TouchBarSpacer({size: 'small'}),
  starredNotes,
  new TouchBarSpacer({size: 'small'}),
  trash
])


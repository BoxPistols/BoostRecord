const remote = require('@electron/remote')
const { Menu, MenuItem } = remote

function popup(templates) {
  const menu = new Menu()
  templates.forEach(item => {
    menu.append(new MenuItem(item))
  })
  menu.popup(remote.getCurrentWindow())
}

const context = {
  popup
}

module.export = context
export default context

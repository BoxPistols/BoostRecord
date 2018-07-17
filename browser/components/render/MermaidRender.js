import mermaidAPI from 'mermaid'

function getRandomInt (min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

function getId () {
  var pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  var id = 'm-'
  for (var i = 0; i < 7; i++) {
    id += pool[getRandomInt(0, 16)]
  }
  return id
}

function render (element, content) {
  try {
    mermaidAPI.render(getId(), content, (svgGraph) => {
      element.innerHTML = svgGraph
    })
  } catch (e) {
    console.error(e)
    element.className = 'mermaid-error'
    element.innerHTML = 'mermaid diagram parse error: ' + e.message
  }
}

export default render

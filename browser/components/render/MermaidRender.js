import mermaidAPI from 'mermaid'

// fixes bad styling in the mermaid dark theme
const darkThemeStyling = `
.loopText tspan {
  fill: white;
}`

function getRandomInt (min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

function getId () {
  const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let id = 'm-'
  for (let i = 0; i < 7; i++) {
    id += pool[getRandomInt(0, 16)]
  }
  return id
}

function render (element, content, theme) {
  try {
    const height = element.attributes.getNamedItem('data-height')
    const isPredefined = height && height.value !== 'undefined'
    if (isPredefined) {
      element.style.height = height.value + 'vh'
    }
    const isDarkTheme = theme === 'dark' || theme === 'solarized-dark' || theme === 'monokai' || theme === 'dracula'
    mermaidAPI.initialize({
      theme: isDarkTheme ? 'dark' : 'default',
      themeCSS: isDarkTheme ? darkThemeStyling : '',
      gantt: {
        useWidth: element.clientWidth
      }
    })
    mermaidAPI.render(getId(), content, (svgGraph) => {
      element.innerHTML = svgGraph

      if (!isPredefined) {
        const el = element.firstChild
        const viewBox = el.getAttribute('viewBox').split(' ')

        let ratio = viewBox[2] / viewBox[3]

        if (el.style.maxWidth) {
          const maxWidth = parseFloat(el.style.maxWidth)

          ratio *= el.parentNode.clientWidth / maxWidth
        }

        el.setAttribute('ratio', ratio)
        el.setAttribute('height', el.parentNode.clientWidth / ratio)
      }
    })
  } catch (e) {
    element.className = 'mermaid-error'
    element.innerHTML = 'mermaid diagram parse error: ' + e.message
  }
}

export default render

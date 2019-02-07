import mermaidAPI from 'mermaid'
import uiThemes from 'browser/lib/ui-themes'

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

    if (height && height.value !== 'undefined') {
      element.style.height = height.value + 'vh'
    }

    const isDarkTheme = uiThemes.some(item => item.name === theme && item.isDark)

    mermaidAPI.initialize({
      theme: isDarkTheme ? 'dark' : 'default',
      themeCSS: isDarkTheme ? darkThemeStyling : '',
      useMaxWidth: false
    })

    mermaidAPI.render(getId(), content, (svgGraph) => {
      element.innerHTML = svgGraph
    })
  } catch (e) {
    element.className = 'mermaid-error'
    element.innerHTML = 'mermaid diagram parse error: ' + e.message
  }
}

export default render

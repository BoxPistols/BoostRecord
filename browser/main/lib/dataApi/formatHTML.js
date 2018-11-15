import path from 'path'
import fileUrl from 'file-url'
import { remote } from 'electron'
import consts from 'browser/lib/consts'
import Markdown from 'browser/lib/markdown'
import attachmentManagement from './attachmentManagement'

const { app } = remote
const appPath = fileUrl(process.env.NODE_ENV === 'production' ? app.getAppPath() : path.resolve())

let markdownStyle = ''
try {
  markdownStyle = require('!!css!stylus?sourceMap!../../../components/markdown.styl')[0][1]
} catch (e) {}

export const CSS_FILES = [
  `${appPath}/node_modules/katex/dist/katex.min.css`,
  `${appPath}/node_modules/codemirror/lib/codemirror.css`
]

const defaultFontFamily = ['helvetica', 'arial', 'sans-serif']
if (global.process.platform !== 'darwin') {
  defaultFontFamily.unshift('Microsoft YaHei')
  defaultFontFamily.unshift('meiryo')
}

const defaultCodeBlockFontFamily = [
  'Monaco',
  'Menlo',
  'Ubuntu Mono',
  'Consolas',
  'source-code-pro',
  'monospace'
]

/**
 * ```
 * {
 *   fontFamily,
 *   fontSize,
 *   lineNumber,
 *   codeBlockFontFamily,
 *   codeBlockTheme,
 *   scrollPastEnd,
 *   theme,
 *   allowCustomCSS,
 *   customCSS
 *   smartQuotes,
 *   sanitize,
 *   breaks,
 *   storagePath,
 *   export
 * }
 * ```
 */
export default function formatHTML (props) {
  const {
    fontFamily,
    fontSize,
    codeBlockFontFamily,
    lineNumber,
    codeBlockTheme,
    scrollPastEnd,
    theme,
    allowCustomCSS,
    customCSS
  } = getStyleParams(props)

  const inlineStyles = buildStyle(
    fontFamily,
    fontSize,
    codeBlockFontFamily,
    lineNumber,
    scrollPastEnd,
    theme,
    allowCustomCSS,
    customCSS
  )
  const { smartQuotes, sanitize, breaks } = props

  const markdown = new Markdown({
    typographer: smartQuotes,
    sanitize,
    breaks
  })

  const files = [getCodeThemeLink(codeBlockTheme), ...CSS_FILES]

  return function (note, targetPath, exportTasks) {
    let body = markdown.render(note.content)

    const attachmentsAbsolutePaths = attachmentManagement.getAbsolutePathsOfAttachmentsInContent(note.content, props.storagePath)

    files.forEach(file => {
      if (global.process.platform === 'win32') {
        file = file.replace('file:///', '')
      } else {
        file = file.replace('file://', '')
      }
      exportTasks.push({
        src: file,
        dst: 'css'
      })
    })

    const destinationFolder = props.export.prefixAttachmentFolder ? `${path.parse(targetPath).name} - ${attachmentManagement.DESTINATION_FOLDER}` : attachmentManagement.DESTINATION_FOLDER

    attachmentsAbsolutePaths.forEach(attachment => {
      exportTasks.push({
        src: attachment,
        dst: destinationFolder
      })
    })

    body = attachmentManagement.replaceStorageReferences(body, note.key, destinationFolder)

    let styles = ''
    files.forEach(file => {
      styles += `<link rel="stylesheet" href="css/${path.basename(file)}">`
    })

    return `<html>
                <head>
                  <meta charset="UTF-8">
                  <meta name = "viewport" content = "width = device-width, initial-scale = 1, maximum-scale = 1">
                  <style id="style">${inlineStyles}</style>
                  ${styles}
                </head>
                <body>${body}</body>
            </html>`
  }
}

export function getStyleParams (props) {
  const {
    fontSize,
    lineNumber,
    codeBlockTheme,
    scrollPastEnd,
    theme,
    allowCustomCSS,
    customCSS
  } = props

  let { fontFamily, codeBlockFontFamily } = props

  fontFamily = _.isString(fontFamily) && fontFamily.trim().length > 0
    ? fontFamily
        .split(',')
        .map(fontName => fontName.trim())
        .concat(defaultFontFamily)
    : defaultFontFamily

  codeBlockFontFamily = _.isString(codeBlockFontFamily) &&
    codeBlockFontFamily.trim().length > 0
    ? codeBlockFontFamily
        .split(',')
        .map(fontName => fontName.trim())
        .concat(defaultCodeBlockFontFamily)
    : defaultCodeBlockFontFamily

  return {
    fontFamily,
    fontSize,
    codeBlockFontFamily,
    lineNumber,
    codeBlockTheme,
    scrollPastEnd,
    theme,
    allowCustomCSS,
    customCSS
  }
}

export function getCodeThemeLink (theme) {
  if (consts.THEMES.some(_theme => _theme === theme)) {
    theme = theme !== 'default' ? theme : 'elegant'
  }

  return theme.startsWith('solarized')
    ? `${appPath}/node_modules/codemirror/theme/solarized.css`
    : `${appPath}/node_modules/codemirror/theme/${theme}.css`
}

export function buildStyle (
  fontFamily,
  fontSize,
  codeBlockFontFamily,
  lineNumber,
  scrollPastEnd,
  theme,
  allowCustomCSS,
  customCSS
) {
  return `
@font-face {
  font-family: 'Lato';
  src: url('${appPath}/resources/fonts/Lato-Regular.woff2') format('woff2'), /* Modern Browsers */
       url('${appPath}/resources/fonts/Lato-Regular.woff') format('woff'), /* Modern Browsers */
       url('${appPath}/resources/fonts/Lato-Regular.ttf') format('truetype');
  font-style: normal;
  font-weight: normal;
  text-rendering: optimizeLegibility;
}
@font-face {
  font-family: 'Lato';
  src: url('${appPath}/resources/fonts/Lato-Black.woff2') format('woff2'), /* Modern Browsers */
       url('${appPath}/resources/fonts/Lato-Black.woff') format('woff'), /* Modern Browsers */
       url('${appPath}/resources/fonts/Lato-Black.ttf') format('truetype');
  font-style: normal;
  font-weight: 700;
  text-rendering: optimizeLegibility;
}
@font-face {
  font-family: 'Material Icons';
  font-style: normal;
  font-weight: 400;
  src: local('Material Icons'),
       local('MaterialIcons-Regular'),
       url('${appPath}/resources/fonts/MaterialIcons-Regular.woff2') format('woff2'),
       url('${appPath}/resources/fonts/MaterialIcons-Regular.woff') format('woff'),
       url('${appPath}/resources/fonts/MaterialIcons-Regular.ttf') format('truetype');
}
${markdownStyle}

body {
  font-family: '${fontFamily.join("','")}';
  font-size: ${fontSize}px;
  ${scrollPastEnd && 'padding-bottom: 90vh;'}
}
@media print {
  body {
    padding-bottom: initial;
  }
}
code {
  font-family: '${codeBlockFontFamily.join("','")}';
  background-color: rgba(0,0,0,0.04);
}
.lineNumber {
  ${lineNumber && 'display: block !important;'}
  font-family: '${codeBlockFontFamily.join("','")}';
}

.clipboardButton {
  color: rgba(147,147,149,0.8);;
  fill: rgba(147,147,149,1);;
  border-radius: 50%;
  margin: 0px 10px;
  border: none;
  background-color: transparent;
  outline: none;
  height: 15px;
  width: 15px;
  cursor: pointer;
}

.clipboardButton:hover {
  transition: 0.2s;
  color: #939395;
  fill: #939395;
  background-color: rgba(0,0,0,0.1);
}

h1, h2 {
  border: none;
}

h1 {
  padding-bottom: 4px;
  margin: 1em 0 8px;
}

h2 {
  padding-bottom: 0.2em;
  margin: 1em 0 0.37em;
}

body p {
  white-space: normal;
}

@media print {
  body[data-theme="${theme}"] {
    color: #000;
    background-color: #fff;
  }
  .clipboardButton {
    display: none
  }
}

${allowCustomCSS ? customCSS : ''}
`
}

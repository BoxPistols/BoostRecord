import formatMarkdown from './formatMarkdown'
import formatHTML from './formatHTML'
import formatPDF from './formatPDF'

/**
 * @param {Object} storage
 * @param {String} fileType
 * @param {Object} config
 */

export default function getContentFormatter(storage, fileType, config) {
  if (fileType === 'md') {
    return formatMarkdown({
      storagePath: storage.path,
      export: config.export
    })
  } else if (fileType === 'html') {
    return formatHTML({
      theme: config.ui.theme,
      fontSize: config.preview.fontSize,
      fontFamily: config.preview.fontFamily,
      codeBlockTheme: config.preview.codeBlockTheme,
      codeBlockFontFamily: config.editor.fontFamily,
      lineNumber: config.preview.lineNumber,
      indentSize: config.editor.indentSize,
      scrollPastEnd: config.preview.scrollPastEnd,
      smartQuotes: config.preview.smartQuotes,
      breaks: config.preview.breaks,
      sanitize: config.preview.sanitize,
      customCSS: config.preview.customCSS,
      allowCustomCSS: config.preview.allowCustomCSS,
      storagePath: storage.path,
      export: config.export,
      RTL: config.editor.rtlEnabled /*  && this.state.RTL */
    })
  } else if (fileType === 'pdf') {
    return formatPDF({
      theme: config.ui.theme,
      fontSize: config.preview.fontSize,
      fontFamily: config.preview.fontFamily,
      codeBlockTheme: config.preview.codeBlockTheme,
      codeBlockFontFamily: config.editor.fontFamily,
      lineNumber: config.preview.lineNumber,
      indentSize: config.editor.indentSize,
      scrollPastEnd: config.preview.scrollPastEnd,
      smartQuotes: config.preview.smartQuotes,
      breaks: config.preview.breaks,
      sanitize: config.preview.sanitize,
      customCSS: config.preview.customCSS,
      allowCustomCSS: config.preview.allowCustomCSS,
      storagePath: storage.path,
      export: config.export,
      RTL: config.editor.rtlEnabled /*  && this.state.RTL */
    })
  }

  return null
}

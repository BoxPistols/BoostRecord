/**
 * @fileoverview Ready-made snippets for the "Custom CSS" box in
 * Preferences > UI. The box starts empty, so there is nothing to tell the
 * reader which selectors the preview actually uses; these templates are the
 * discoverable answer.
 *
 * Rules the snippets follow, so that inserting one never breaks a theme:
 *
 * - No `!important`. Custom CSS is appended last in the generated stylesheet
 *   (see formatHTML.js), so an equal-specificity rule already wins. Using
 *   `!important` here would only make the *next* rule the user writes lose.
 * - Colours are neutral translucent greys (`rgba(128, 128, 128, x)`), which
 *   read correctly on both light and dark backgrounds. Hard-coded hex values
 *   are confined to the theme-branch template, where they are per theme.
 * - The preview body carries `data-theme="<ui theme name>"`, which is the
 *   supported hook for per-theme overrides.
 *
 * No display text lives in this file: labels and the comment lines that get
 * inserted with the CSS are i18n keys, resolved at insert time.
 */

// Keys are also listed in tests/lib/customCSSTemplates.test.js, which asserts
// every one of them exists in locales/en.json and locales/ja.json.
export const CUSTOM_CSS_TEMPLATES = [
  {
    id: 'heading-rhythm',
    labelKey: 'Heading spacing and line height',
    noteKeys: [
      'Loosens the vertical rhythm of headings and body text.',
      'Relative units only, so it follows the preview font size setting.'
    ],
    css: `h1, h2, h3, h4, h5, h6 {
  line-height: 1.35;
}
h1, h2 {
  margin-top: 2em;
  margin-bottom: 0.75em;
}
h3, h4, h5, h6 {
  margin-top: 1.6em;
  margin-bottom: 0.5em;
}
p, ul, ol {
  line-height: 1.8;
}`
  },
  {
    id: 'inline-code',
    labelKey: 'Inline code appearance',
    noteKeys: [
      'Gives inline code a padded, outlined chip.',
      'The second rule undoes it inside code blocks, which would otherwise be boxed twice.'
    ],
    css: `code {
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.92em;
  background-color: rgba(128, 128, 128, 0.16);
  border: 1px solid rgba(128, 128, 128, 0.28);
}
pre code {
  padding: 0;
  border: none;
  background-color: transparent;
}`
  },
  {
    id: 'table-borders',
    labelKey: 'Table rules and cell padding',
    noteKeys: [
      'Draws a full grid and widens the cells.',
      'The zebra stripe is translucent, so the theme background shows through instead of being replaced.'
    ],
    css: `table {
  border-collapse: collapse;
}
th, td {
  border: 1px solid rgba(128, 128, 128, 0.45);
  padding: 0.5em 0.8em;
}
thead th {
  font-weight: 600;
}
tbody tr:nth-child(2n) {
  background-color: rgba(128, 128, 128, 0.08);
}`
  },
  {
    id: 'code-block',
    labelKey: 'Code block padding',
    noteKeys: [
      'Widens the gutter around fenced code blocks and rounds their corners.',
      'Leaves the syntax colours alone, so the code block theme setting still applies.'
    ],
    css: `pre {
  padding: 1em 1.2em;
  border-radius: 6px;
  line-height: 1.6;
}
pre.fence {
  margin: 1.2em 0;
}`
  },
  {
    id: 'print',
    labelKey: 'Print and PDF export',
    noteKeys: [
      'Keeps blocks from being split across pages and prints link targets.',
      'Only applies to Print and Export as PDF; the on-screen preview is untouched.'
    ],
    css: `@media print {
  body {
    font-size: 11pt;
  }
  pre, blockquote, table, figure {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  h1, h2, h3 {
    break-after: avoid;
    page-break-after: avoid;
  }
  a[href^="http"]::after {
    content: " (" attr(href) ")";
    font-size: 0.85em;
    word-break: break-all;
  }
}`
  },
  {
    id: 'theme-branch',
    labelKey: 'Per-theme overrides',
    noteKeys: [
      'The preview body carries data-theme, set to the UI theme name.',
      'Use the names shown in Preferences > UI > Theme; anything not listed keeps the rule above it.'
    ],
    css: `blockquote {
  border-left-width: 4px;
}
body[data-theme="default"] blockquote {
  border-left-color: #3f7fbf;
}
body[data-theme="dark"] blockquote {
  border-left-color: #7fb4e6;
}`
  }
]

export function findCustomCSSTemplate(id) {
  return CUSTOM_CSS_TEMPLATES.find(template => template.id === id) || null
}

/**
 * Renders one template as the text to append to the user's custom CSS: the
 * label and notes as CSS comments in the user's language, then the rules.
 *
 * @param {object} template one of CUSTOM_CSS_TEMPLATES
 * @param {function(string): string} translate i18n.__ (or any key -> text fn)
 * @returns {string} snippet with no leading or trailing blank lines
 */
export function buildCustomCSSSnippet(template, translate) {
  if (template == null) return ''
  const t = typeof translate === 'function' ? translate : key => key
  // `/* */` does not nest, so a stray `*/` in a translation would end the
  // comment early and leak the rest of the sentence into the stylesheet.
  const comment = text => `/* ${String(t(text)).replace(/\*\//g, '* /')} */`
  const lines = [comment(template.labelKey)]
  for (const noteKey of template.noteKeys) lines.push(comment(noteKey))
  lines.push(template.css)
  return lines.join('\n')
}

/**
 * Appends a template to existing custom CSS, keeping exactly one blank line
 * between the two. Inserting must never discard what the user already wrote.
 *
 * @param {string} currentCSS the current contents of the box
 * @param {object} template one of CUSTOM_CSS_TEMPLATES
 * @param {function(string): string} translate i18n.__
 * @returns {string} the new contents of the box
 */
export function appendCustomCSSTemplate(currentCSS, template, translate) {
  const snippet = buildCustomCSSSnippet(template, translate)
  if (snippet === '') return typeof currentCSS === 'string' ? currentCSS : ''
  const existing = typeof currentCSS === 'string' ? currentCSS : ''
  if (existing.trim() === '') return snippet + '\n'
  return existing.replace(/\s*$/, '') + '\n\n' + snippet + '\n'
}

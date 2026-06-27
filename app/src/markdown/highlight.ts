// Code-block syntax highlighting for the preview. We import highlight.js core
// plus a curated language subset (not the full bundle) so only these languages
// are shipped — keeping the bundle lean. Built-in aliases (js, ts, html, sh, …)
// are registered automatically with their parent language.
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'

const LANGUAGES = {
  javascript,
  typescript,
  xml,
  css,
  json,
  bash,
  python,
  go,
  rust,
  sql,
  yaml,
  markdown
}

for (const [name, def] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, def)
}

/**
 * markdown-it `highlight` callback. Returns a full `<pre class="hljs">` block
 * for a known language; an empty string otherwise so markdown-it falls back to
 * its own safe escaping.
 */
export function highlightCode(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      const out = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
      return `<pre class="hljs"><code>${out}</code></pre>`
    } catch {
      /* fall through to default escaping */
    }
  }
  return ''
}

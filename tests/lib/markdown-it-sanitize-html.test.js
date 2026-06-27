const MarkdownIt = require('markdown-it')
const sanitize = require('browser/lib/markdown-it-sanitize-html')

const options = {
  allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
  allowedAttributes: { '*': ['href', 'title'] },
  selfClosing: ['img', 'br', 'hr', 'input'],
  allowedSchemes: ['http', 'https', 'ftp', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite']
}

const render = src =>
  new MarkdownIt({ html: true }).use(sanitize, options).render(src)

it('strips disallowed html blocks such as <script>', () => {
  const html = render('<script>alert(1)</script>')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('alert(1)')
})

it('keeps allowed html block tags', () => {
  const html = render('<p>kept</p>')
  expect(html).toContain('kept')
})

it('escapes html inside fenced code blocks', () => {
  const html = render('```\n<script>x</script>\n```')
  expect(html).not.toContain('<script>x</script>')
  expect(html).toContain('&lt;script&gt;')
})

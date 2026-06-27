const MarkdownIt = require('markdown-it')
const deflist = require('browser/lib/markdown-it-deflist')

const render = src => new MarkdownIt().use(deflist).render(src)

it('renders a definition list from term/definition syntax', () => {
  const html = render('Term\n: Definition')
  expect(html).toContain('<dl>')
  expect(html).toContain('<dt>Term</dt>')
  expect(html).toContain('<dd>Definition</dd>')
})

it('supports multiple definitions for a term', () => {
  const html = render('Term\n: First\n: Second')
  expect((html.match(/<dd>/g) || []).length).toBe(2)
  expect(html).toContain('First')
  expect(html).toContain('Second')
})

it('leaves a normal paragraph untouched', () => {
  const html = render('Just a paragraph')
  expect(html).toContain('<p>Just a paragraph</p>')
  expect(html).not.toContain('<dl>')
})

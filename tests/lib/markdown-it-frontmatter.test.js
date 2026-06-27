const MarkdownIt = require('markdown-it')
const frontmatter = require('browser/lib/markdown-it-frontmatter')

const render = src => new MarkdownIt().use(frontmatter).render(src)

it('consumes leading frontmatter so it is not rendered', () => {
  const html = render('---\ntitle: Hello\n---\n\n# Body')
  expect(html).toContain('Body')
  expect(html).not.toContain('title: Hello')
})

it('renders content that has no frontmatter unchanged', () => {
  const html = render('# Just a heading')
  expect(html).toContain('Just a heading')
})

it('does not treat a horizontal rule mid-document as frontmatter', () => {
  const html = render('Intro\n\n---\n\nMore')
  expect(html).toContain('Intro')
  expect(html).toContain('More')
})

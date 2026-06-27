const MarkdownIt = require('markdown-it')
const fence = require('browser/lib/markdown-it-fence')

const buildMd = (renderers, defaultRenderer) =>
  new MarkdownIt().use(fence, renderers, defaultRenderer)

it('uses the custom renderer for a registered lang type', () => {
  const md = buildMd(
    { chart: token => `<chart>${token.content.trim()}</chart>` },
    token => `<code>${token.content.trim()}</code>`
  )
  expect(md.render('```chart\nDATA\n```')).toContain('<chart>DATA</chart>')
})

it('falls back to the default renderer for unregistered lang types', () => {
  const md = buildMd(
    { chart: token => `<chart/>` },
    token => `<code>${token.content.trim()}</code>`
  )
  expect(md.render('```js\nconst x = 1\n```')).toContain(
    '<code>const x = 1</code>'
  )
})

it('parses fence parameters, file name and lang type', () => {
  let captured
  const md = buildMd(
    {
      chart: token => {
        captured = token
        return '<x/>'
      }
    },
    () => ''
  )
  md.render('```chart(format=yaml):myfile\nDATA\n```')
  expect(captured.langType).toBe('chart')
  expect(captured.fileName).toBe('myfile')
  expect(captured.parameters.format).toBe('yaml')
})

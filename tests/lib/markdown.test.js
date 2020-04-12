import Markdown from 'browser/lib/markdown'
import markdownFixtures from '../fixtures/markdowns'

// basic markdown instance which meant to be used in every test cases.
// To test markdown options, initialize a new instance in your test case
const md = new Markdown()

test('Markdown.render() should renders markdown correctly', () => {
  const rendered = md.render(markdownFixtures.basic)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should renders codeblock correctly', () => {
  const rendered = md.render(markdownFixtures.codeblock)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should renders KaTeX correctly', () => {
  const rendered = md.render(markdownFixtures.katex)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should renders checkboxes', () => {
  const rendered = md.render(markdownFixtures.checkboxes)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should text with quotes correctly', () => {
  const renderedSmartQuotes = md.render(markdownFixtures.smartQuotes)
  expect(renderedSmartQuotes).toMatchSnapshot()

  const newmd = new Markdown({ typographer: false })
  const renderedNonSmartQuotes = newmd.render(markdownFixtures.smartQuotes)
  expect(renderedNonSmartQuotes).toMatchSnapshot()
})

test('Markdown.render() should render line breaks correctly', () => {
  const renderedBreaks = md.render(markdownFixtures.breaks)
  expect(renderedBreaks).toMatchSnapshot()

  const newmd = new Markdown({ breaks: false })
  const renderedNonBreaks = newmd.render(markdownFixtures.breaks)
  expect(renderedNonBreaks).toMatchSnapshot()
})

test('Markdown.render() should renders abbrevations correctly', () => {
  const rendered = md.render(markdownFixtures.abbrevations)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should renders sub correctly', () => {
  const rendered = md.render(markdownFixtures.subTexts)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should renders sup correctly', () => {
  const rendered = md.render(markdownFixtures.supTexts)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should renders definition lists correctly', () => {
  const rendered = md.render(markdownFixtures.deflists)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should render shortcuts correctly', () => {
  const rendered = md.render(markdownFixtures.shortcuts)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should render footnote correctly', () => {
  const rendered = md.render(markdownFixtures.footnote)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should renders [TOC] placholder correctly', t => {
  const rendered = md.render(markdownFixtures.tocPlaceholder)
  t.snapshot(rendered)
})

test('Markdown.render() should render PlantUML MindMaps correctly', t => {
  const rendered = md.render(markdownFixtures.plantUmlMindMap)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should render PlantUML Gantt correctly', t => {
  const rendered = md.render(markdownFixtures.plantUmlGantt)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should render PlantUML WBS correctly', t => {
  const rendered = md.render(markdownFixtures.plantUmlWbs)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should render PlantUML Umls correctly', t => {
  const rendered = md.render(markdownFixtures.plantUmlUml)
  expect(rendered).toMatchSnapshot()
})

test('Markdown.render() should render PlantUML Ditaa correctly', t => {
  const rendered = md.render(markdownFixtures.plantUmlDitaa)
  expect(rendered).toMatchSnapshot()
})

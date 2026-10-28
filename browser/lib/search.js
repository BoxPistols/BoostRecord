import _ from 'lodash'

// "..." で囲んだ部分はひと続きの語句、それ以外は空白で区切った語として扱う
const TOKEN_PATTERN = /"([^"]+)"|(\S+)/g

export function parseSearch(search) {
  const tokens = []
  let m
  TOKEN_PATTERN.lastIndex = 0
  while ((m = TOKEN_PATTERN.exec(search))) {
    if (m[1] != null) {
      const phrase = m[1].trim()
      if (phrase) tokens.push({ phrase })
    } else {
      tokens.push({ word: m[2] })
    }
  }
  return tokens
}

export default function searchFromNotes(notes, search) {
  if (search.trim().length === 0) return []

  let foundNotes = notes
  parseSearch(search).forEach(token => {
    foundNotes = token.phrase
      ? findByPhrase(foundNotes, token.phrase)
      : findByWordOrTag(foundNotes, token.word)
  })
  return foundNotes
}

function toLowerText(value) {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

// 語句は並びのまま探す。空白と改行の違いは問わない（複数行を貼り付けた検索のため）
function findByPhrase(notes, phrase) {
  const source = phrase
    .split(/\s+/)
    .map(part => _.escapeRegExp(part))
    .join('\\s+')
  const phraseRegExp = new RegExp(source, 'i')
  return notes.filter(note => {
    if (note.type === 'SNIPPET_NOTE') {
      const description = toLowerText(note.description)
      const snippets = _.isArray(note.snippets) ? note.snippets : []
      return (
        phraseRegExp.test(description) ||
        snippets.some(
          snippet =>
            phraseRegExp.test(toLowerText(snippet && snippet.name)) ||
            phraseRegExp.test(toLowerText(snippet && snippet.content))
        )
      )
    } else if (note.type === 'MARKDOWN_NOTE') {
      return phraseRegExp.test(toLowerText(note.content))
    }
    return false
  })
}

function findByWordOrTag(notes, block) {
  const lowerBlock = toLowerText(block)
  const tag = lowerBlock.match(/^#.+/) ? lowerBlock.slice(1) : lowerBlock
  return notes.filter(note => {
    if (
      _.isArray(note.tags) &&
      note.tags.some(_tag => toLowerText(_tag).includes(tag))
    ) {
      return true
    }
    if (note.type === 'SNIPPET_NOTE') {
      const description = toLowerText(note.description)
      const snippets = _.isArray(note.snippets) ? note.snippets : []
      return (
        description.includes(lowerBlock) ||
        snippets.some(snippet => {
          return (
            toLowerText(snippet && snippet.name).includes(lowerBlock) ||
            toLowerText(snippet && snippet.content).includes(lowerBlock)
          )
        })
      )
    } else if (note.type === 'MARKDOWN_NOTE') {
      return toLowerText(note.content).includes(lowerBlock)
    }
    return false
  })
}

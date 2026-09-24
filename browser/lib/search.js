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

// 語句は並びのまま探す。空白と改行の違いは問わない（複数行を貼り付けた検索のため）
function findByPhrase(notes, phrase) {
  const source = phrase
    .split(/\s+/)
    .map(part => _.escapeRegExp(part))
    .join('\\s+')
  const phraseRegExp = new RegExp(source, 'i')
  return notes.filter(note => {
    if (note.type === 'SNIPPET_NOTE') {
      return (
        phraseRegExp.test(note.description || '') ||
        note.snippets.some(
          snippet =>
            phraseRegExp.test(snippet.name || '') ||
            phraseRegExp.test(snippet.content || '')
        )
      )
    } else if (note.type === 'MARKDOWN_NOTE') {
      return phraseRegExp.test(note.content || '')
    }
    return false
  })
}

function findByWordOrTag(notes, block) {
  let tag = block
  if (tag.match(/^#.+/)) {
    tag = tag.match(/#(.+)/)[1]
  }
  const tagRegExp = new RegExp(_.escapeRegExp(tag), 'i')
  const wordRegExp = new RegExp(_.escapeRegExp(block), 'i')
  return notes.filter(note => {
    if (_.isArray(note.tags) && note.tags.some(_tag => _tag.match(tagRegExp))) {
      return true
    }
    if (note.type === 'SNIPPET_NOTE') {
      return (
        note.description.match(wordRegExp) ||
        note.snippets.some(snippet => {
          return (
            snippet.name.match(wordRegExp) || snippet.content.match(wordRegExp)
          )
        })
      )
    } else if (note.type === 'MARKDOWN_NOTE') {
      return note.content.match(wordRegExp)
    }
    return false
  })
}

import _ from 'lodash'

export default function searchFromNotes (notes, search) {
  if (search.trim().length === 0) return []
  const searchBlocks = search.split(' ').filter(block => { return block !== '' })
  let foundNotes = []
  searchBlocks.forEach((block) => {
    foundNotes = findByWord(notes, block)
    if (block.match(/^#.+/)) {
      foundNotes = foundNotes.concat(findByTag(notes, block))
    }
  })
  return foundNotes
}

function findByTag (notes, block) {
  const tag = block.match(/#(.+)/)[1]
  let regExp = new RegExp(_.escapeRegExp(tag), 'i')
  return notes.filter((note) => {
    if (!_.isArray(note.tags)) return false
    return note.tags.some((_tag) => {
      return _tag.match(regExp)
    })
  })
}

function findByWord (notes, block) {
  let regExp = new RegExp(_.escapeRegExp(block), 'i')
  return notes.filter((note) => {
    if (_.isArray(note.tags) && note.tags.some((_tag) => {
      return _tag.match(regExp)
    })) {
      return true
    }
    if (note.type === 'SNIPPET_NOTE') {
      return note.description.match(regExp)
    } else if (note.type === 'MARKDOWN_NOTE') {
      return note.content.match(regExp)
    }
    return false
  })
}

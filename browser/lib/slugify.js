module.exports = function slugify (title) {
  return encodeURI(title.trim()
    .replace(/[\]\[\!\"\#\$\%\&\'\(\)\*\+\,\.\/\:\;\<\=\>\?\@\\\^\_\{\|\}\~]/g, '')
    .replace(/\s+/g, '-'))
    .replace(/\-+$/, '')
}

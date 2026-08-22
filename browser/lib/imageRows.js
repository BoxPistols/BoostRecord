/**
 * @fileoverview Marks paragraphs that contain only consecutive images so the
 * preview can lay them out as a responsive side-by-side flex row (class
 * `imageRow`, styled in browser/components/markdown.styl).
 *
 * With `breaks: true` (the default), images written on consecutive lines end
 * up in one <p> separated by <br> — exactly the "連続した画像" case. A
 * paragraph qualifies when it holds 2+ images (optionally wrapped in links)
 * and nothing else but whitespace and <br>.
 */

const TEXT_NODE = 3
const ELEMENT_NODE = 1

function countImagesInAnchor(anchor) {
  // A link wrapping an image is fine; a link with visible text is content.
  if ((anchor.textContent || '').trim() !== '') return -1
  const imgs = anchor.querySelectorAll('img')
  return imgs.length > 0 ? imgs.length : -1
}

function countRowImages(paragraph) {
  let imageCount = 0
  const nodes = paragraph.childNodes
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.nodeType === TEXT_NODE) {
      if ((node.textContent || '').trim() !== '') return -1
      continue
    }
    if (node.nodeType !== ELEMENT_NODE) continue
    const tag = node.tagName
    if (tag === 'BR') continue
    if (tag === 'IMG') {
      imageCount++
      continue
    }
    if (tag === 'A') {
      const inAnchor = countImagesInAnchor(node)
      if (inAnchor < 0) return -1
      imageCount += inAnchor
      continue
    }
    return -1
  }
  return imageCount
}

/**
 * Adds class "imageRow" to qualifying paragraphs. Returns how many
 * paragraphs were marked.
 */
export function markImageRows(doc) {
  const body = doc.body
  if (body == null) return 0

  let marked = 0
  const paragraphs = body.querySelectorAll('p')
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i]
    if (paragraph.classList.contains('imageRow')) continue
    if (countRowImages(paragraph) >= 2) {
      paragraph.classList.add('imageRow')
      marked++
    }
  }
  return marked
}

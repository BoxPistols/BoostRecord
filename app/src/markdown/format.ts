/**
 * Pure text transforms for the editor's formatting shortcuts. Each returns the
 * replacement text plus the selection offsets (relative to the replacement) so
 * the caller can restore a sensible selection after dispatching the change.
 */

export interface FormatResult {
  text: string
  selFrom: number
  selTo: number
}

/** Toggle a wrapping marker (e.g. `**`) around the selection. */
export function toggleWrap(selected: string, marker: string): FormatResult {
  const m = marker.length
  const alreadyWrapped =
    selected.length >= 2 * m &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  if (alreadyWrapped) {
    const inner = selected.slice(m, selected.length - m)
    return { text: inner, selFrom: 0, selTo: inner.length }
  }
  return {
    text: `${marker}${selected}${marker}`,
    selFrom: m,
    selTo: m + selected.length
  }
}

/** Wrap the selection as a markdown link, selecting the `url` placeholder. */
export function makeLink(selected: string): FormatResult {
  const text = `[${selected}](url)`
  const urlStart = selected.length + 3 // `[` + selected + `](`
  return { text, selFrom: urlStart, selTo: urlStart + 3 } // select "url"
}

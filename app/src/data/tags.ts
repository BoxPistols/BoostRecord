/**
 * Tag helpers — pure functions so the rules (normalize, dedupe) are testable
 * and shared between the editor UI and any future callers.
 */

/** Normalize a raw tag: trim and collapse inner whitespace to hyphens. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, '-')
}

/** Add a normalized tag if non-empty and not already present (order kept). */
export function addTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw)
  if (!tag || tags.includes(tag)) return tags
  return [...tags, tag]
}

/** Remove a tag (returns the same array reference when nothing changes). */
export function removeTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter(t => t !== tag) : tags
}

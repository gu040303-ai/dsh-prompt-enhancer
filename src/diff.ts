/**
 * Sentence-level draft diff for the result strip.
 *
 * A rewrite changes nearly every word, so a word-level diff would be confetti.
 * Comparing sentences (further split at commas when a sentence is very long)
 * answers the question the user actually has: which requirements were added,
 * dropped or kept.
 */

export type DiffOp = 'same' | 'add' | 'del'

export interface DiffSegment {
  op: DiffOp
  text: string
}

export interface DiffResult {
  segments: DiffSegment[]
  /** Number of added sentences. */
  added: number
  /** Number of removed sentences. */
  removed: number
  /** True when the pair was too large to compare; callers should say so. */
  truncated: boolean
}

const SENTENCE = /[^。！？!?；;\n]+[。！？!?；;]?|\n/g
const CLAUSE = /(?<=[，,、])/
// Longest unit compared as one row before commas are used to split it further.
const MAX_UNIT = 240
const MAX_CELLS = 2_000_000

/** @param text - draft text. @returns comparable units, newlines removed. */
export function splitSentences(text: string): string[] {
  const units: string[] = []
  for (const piece of text.match(SENTENCE) ?? []) {
    if (piece.trim() === '') continue
    if (piece.length <= MAX_UNIT) { units.push(piece); continue }
    for (const part of piece.split(CLAUSE)) if (part.trim() !== '') units.push(part)
  }
  return units
}

/**
 * @param before - the draft as typed.
 * @param after - the enhancement.
 * @returns segment list in reading order, plus added/removed sentence counts.
 */
export function diffDraft(before: string, after: string): DiffResult {
  const left = splitSentences(before)
  const right = splitSentences(after)
  if ((left.length + 1) * (right.length + 1) > MAX_CELLS) {
    return { segments: [], added: right.length, removed: left.length, truncated: true }
  }
  const width = right.length + 1
  const table = new Uint32Array((left.length + 1) * width)
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      table[i * width + j] = left[i] === right[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }
  const segments: DiffSegment[] = []
  const push = (op: DiffOp, text: string): void => {
    const last = segments[segments.length - 1]
    if (last?.op === op) last.text += text
    else segments.push({ op, text })
  }
  let added = 0
  let removed = 0
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      push('same', left[i]); i++; j++
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      push('del', left[i]); removed++; i++
    } else {
      push('add', right[j]); added++; j++
    }
  }
  while (i < left.length) { push('del', left[i]); removed++; i++ }
  while (j < right.length) { push('add', right[j]); added++; j++ }
  return { segments, added, removed, truncated: false }
}

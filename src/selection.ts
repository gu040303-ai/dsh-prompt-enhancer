/** Exact-text sentence choices: assembling is pure; applying stays one editor transaction. */
export interface SentenceChoice { id: number; same: boolean; before: string; after: string }
export interface SentenceReview { choices: SentenceChoice[]; truncated: boolean }
function units(text: string): string[] {
  return (text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n|[。！？!?；;]/gu) ?? [])
    .flatMap(unit => unit.split(/(?<=\.)(?=\s)/u))
}
export function sentenceReview(before: string, after: string): SentenceReview {
  const left = units(before), right = units(after), width = right.length + 1
  if ((left.length + 1) * width > 2_000_000) return { choices: [], truncated: true }
  const table = new Uint32Array((left.length + 1) * width)
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) {
    table[i * width + j] = left[i] === right[j] ? table[(i + 1) * width + j + 1] + 1
      : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
  }
  const choices: SentenceChoice[] = []
  const push = (same: boolean, original: string, enhanced: string): void => {
    choices.push({ id: choices.length, same, before: original, after: enhanced })
  }
  let i = 0, j = 0
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { push(true, left[i++], right[j++]); continue }
    const removed: string[] = [], added: string[] = []
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) break
      if (i < left.length && (j >= right.length || table[(i + 1) * width + j] >= table[i * width + j + 1])) removed.push(left[i++])
      else added.push(right[j++])
    }
    for (let k = 0; k < Math.max(removed.length, added.length); k++) push(false, removed[k] ?? '', added[k] ?? '')
  }
  // Paragraph spacing belongs to its sentence, never to an empty checkbox row.
  const compact: SentenceChoice[] = []
  let leadingBefore = '', leadingAfter = ''
  for (const choice of choices) {
    if (!choice.before.trim() && !choice.after.trim()) {
      const previous = compact.at(-1)
      if (previous) {
        previous.before += choice.before; previous.after += choice.after
        previous.same = previous.before === previous.after
      } else { leadingBefore += choice.before; leadingAfter += choice.after }
    } else {
      const before = leadingBefore + choice.before, after = leadingAfter + choice.after
      compact.push({ id: compact.length, same: before === after, before, after })
      leadingBefore = ''; leadingAfter = ''
    }
  }
  if (leadingBefore || leadingAfter) compact.push({ id: 0, same: leadingBefore === leadingAfter, before: leadingBefore, after: leadingAfter })
  return { choices: compact, truncated: false }
}
export function assembleReview(review: SentenceReview, selected: ReadonlySet<number>): string {
  if (review.truncated) throw new Error('Sentence comparison is too large')
  return review.choices.map(item => item.same || !selected.has(item.id) ? item.before : item.after).join('')
}

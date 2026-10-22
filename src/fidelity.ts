/**
 * Offline fidelity check: which hard facts of the draft survived the rewrite.
 *
 * Everything here is deterministic and costs no model call. A missing fact is
 * reported, never used to block the write-back: the user decides whether to
 * look at the difference or to append the lost detail again.
 */

export type FactKind = 'code' | 'path' | 'url' | 'mention' | 'number'

export interface Fact {
  kind: FactKind
  value: string
}

export interface FidelityReport {
  /** Distinct hard facts found in the original draft, in first-seen order. */
  facts: Fact[]
  kept: Fact[]
  lost: Fact[]
}

const FENCED_CODE = /```[^\n]*\n([\s\S]*?)```/g
const INLINE_CODE = /`([^`\n]+)`/g
const URL = /https?:\/\/[^\s<>"'`）)\]】，。]+/g
const PATH = /(?:[A-Za-z]:)?(?:[\\/][\w.@+-]+)+|[\w.@+-]+(?:[\\/][\w.@+-]+)+/g
const MENTION = /(?:^|[\s(（【"'`，。；：])@([\w\u4e00-\u9fa5.-]+)/g
// Two or more digits, not touching a separator: dates, times, versions and
// decimals are structural, and reporting their fragments would only add noise.
const NUMBER = /(?<![\w.:/-])\d{2,}(?:\.\d+)?(?![\w.:/-])/g

function looksLikePath(value: string): boolean {
  if (/^[A-Za-z]:/.test(value)) return true
  if (value.includes('\\')) return true
  return value.includes('/') && /\.[A-Za-z0-9]{1,10}$/.test(value)
}

/**
 * @param text - the draft as the user typed it.
 * @returns distinct hard facts, code spans first so their contents are not
 * re-reported as paths, URLs or numbers.
 */
export function extractFacts(text: string): Fact[] {
  const facts: Fact[] = []
  const seen = new Set<string>()
  const add = (kind: FactKind, raw: string): void => {
    const value = raw.trim()
    if (value === '') return
    const key = `${kind}\u0000${value}`
    if (seen.has(key)) return
    seen.add(key)
    facts.push({ kind, value })
  }
  let rest = text.replace(FENCED_CODE, (_match, body: string) => { add('code', body); return '\n' })
  rest = rest.replace(INLINE_CODE, (_match, body: string) => { add('code', body); return ' ' })
  for (const match of rest.matchAll(URL)) add('url', match[0])
  rest = rest.replace(URL, ' ')
  for (const match of rest.matchAll(PATH)) if (looksLikePath(match[0])) add('path', match[0])
  rest = rest.replace(PATH, ' ')
  for (const match of rest.matchAll(MENTION)) add('mention', `@${match[1]}`)
  for (const match of text.matchAll(NUMBER)) add('number', match[0])
  return facts
}

/**
 * @param original - the draft that was sent to the model.
 * @param enhanced - the text the model returned.
 * @returns the facts, split into kept and lost by exact containment.
 */
export function compareFacts(original: string, enhanced: string): FidelityReport {
  const facts = extractFacts(original)
  const kept: Fact[] = []
  const lost: Fact[] = []
  for (const fact of facts) (enhanced.includes(fact.value) ? kept : lost).push(fact)
  return { facts, kept, lost }
}

/**
 * @param text - the enhanced draft.
 * @param facts - facts the enhancement dropped.
 * @param header - localized label introducing the block, supplied by the UI so
 * the appended text stays in the language the user is writing in.
 * @returns the draft with an explicit trailing block, so the agent still
 * receives every detail the user originally wrote. Returns `text` unchanged
 * when nothing was lost.
 */
export function appendFacts(text: string, facts: Fact[], header: string): string {
  if (facts.length === 0) return text
  const lines = facts.map(fact => fact.value)
  return `${text.trimEnd()}\n\n${header}\n${lines.join('\n')}`
}

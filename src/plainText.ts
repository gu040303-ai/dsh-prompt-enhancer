import { extractFacts } from './fidelity.ts'

/** Strip presentation markup, never operators or the user's literal code. */
export function plainPrompt(value: string, original = ''): string {
  let text = value.trim()
  const whole = text.match(/^(`{3,}|~{3,})(?:markdown|md|text|plaintext)?[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/i)
  if (whole) text = whole[2]!
  let prefix = '\uE000DSH'
  while (text.includes(prefix) || original.includes(prefix)) prefix += 'X'
  const saved: string[] = []
  const save = (literal: string): string => `${prefix}${saved.push(literal) - 1}\uE001`
  // Source code and paths can themselves contain markup-looking syntax.
  const literals = extractFacts(original).filter(f => f.kind === 'code' || f.kind === 'path' || f.kind === 'url')
    .map(f => f.value).sort((a, b) => b.length - a.length)
  for (const literal of literals) text = text.split(literal).join(save(literal))
  text = text.replace(/^ {0,3}(`{3,}|~{3,})[^\r\n]*\r?\n([\s\S]*?)\r?\n\1[ \t]*(?=\r?$)/gm,
    (_match, _fence, body: string) => save(body))
  text = text.replace(/(`+)([^\r\n]*?)\1/g, (_match, _ticks, body: string) => save(body))
  const lines = text.split(/\r?\n/), result: string[] = []
  const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim())
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const separator = lines[i + 1]
    if (line.includes('|') && separator?.includes('|') && cells(separator).every(cell => /^:?-{3,}:?$/.test(cell))) {
      const headings = cells(line)
      i += 2
      let rows = 0
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) {
        const row = cells(lines[i]!)
        result.push(row.map((cell, n) => `${headings[n] ? headings[n] + '：' : ''}${cell}`).join('；'))
        rows++; i++
      }
      if (!rows) result.push(headings.join('；'))
      i--; continue
    }
    if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(line) || /^\s*(?:={3,}|-{3,})\s*$/.test(line)) continue
    result.push(line.replace(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?$/, '$1')
      .replace(/^(\s*)>\s?/g, '$1').replace(/^(\s*)[-+*]\s+(?:\[[ xX]\]\s*)?/, '$1'))
  }
  text = result.join('\n')
  // Balanced link destinations retain parentheses in URLs.
  let linked = '', cursor = 0
  const link = /!?\[([^\]\n]+)\]\(/g
  for (let item; (item = link.exec(text));) {
    let depth = 1, end = link.lastIndex
    for (; end < text.length && text[end] !== '\n'; end++) {
      if (text[end] === '(') depth++
      if (text[end] === ')' && --depth === 0) break
    }
    if (depth !== 0) continue
    const destination = text.slice(link.lastIndex, end).trim()
    linked += text.slice(cursor, item.index) + (item[1] === destination ? destination : `${item[1]}（${destination}）`)
    cursor = end + 1; link.lastIndex = cursor
  }
  text = linked + text.slice(cursor)
  text = text.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/~~(?=\S)([^\n]*?\S)~~/g, '$1')
    .replace(/(^|[\s（(])([*_])(\S(?:[^\n]*?\S)?)\2(?=$|[\s，。；：！？,.;:!?)）])/g, '$1$3')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|tr)\b[^>]*>/gi, '\n')
    .replace(/<\/?(?:strong|em|b|i|span|code|table|thead|tbody|td|th)\b[^>]*>/gi, '')
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim()
  // Restore recursively: a protected block may contain an earlier protected literal.
  for (let i = saved.length - 1; i >= 0; i--) text = text.split(`${prefix}${i}\uE001`).join(saved[i]!)
  // The prose was trimmed before restoration. Do not trim a restored code block:
  // its leading indentation can be executable Python or whitespace-sensitive data.
  return text
}

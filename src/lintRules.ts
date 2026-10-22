import { check, finding, type LintCheck, type LintFinding } from './lintTypes.ts'

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/
const WRITE = /写入|写文件|修改|改写|编辑|删除|保存|创建|新增|移动|\b(?:write|edit|modify|delete|save|create|move)\b/i
const ACTION = /写入|写文件|修改|编辑|删除|执行|运行|联网|搜索|下载|推送|\b(?:write|edit|delete|execute|run|fetch|download|push)\b/i
const OUTPUT = /表格|清单|列表|字数|篇幅|受众|文件名|报告|代码片段|\b(?:JSON|Markdown|CSV|HTML|PDF|DOCX|table|checklist|audience|words?)\b|[\w-]+\.(?:md|txt|json|csv|pdf|docx|html)\b/i
const LIMIT = 32
const unique = (items: string[]): string[] => [...new Set(items)].slice(0, LIMIT)
export const isWriteRequest = (text: string): boolean => WRITE.test(text)

/** Explicit tool syntax and exact registered names; prose and API members are excluded. */
export function toolTokens(text: string, registered: readonly string[]): string[] {
  const tokens: string[] = []
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const value = match[1]
    const prefix = text.slice(Math.max(0, match.index! - 24), match.index)
    if (IDENTIFIER.test(value) && (registered.includes(value) || /(?:工具|tool|调用|call)\s*[:：]?\s*$/i.test(prefix)
      || value.startsWith('mcp__'))) tokens.push(value)
  }
  // Scan words once rather than building a regex from a potentially large tool catalog.
  const visible = new Set(registered)
  for (const match of text.matchAll(/[A-Za-z_][A-Za-z0-9_-]{0,127}/g)) {
    const value = match[0], before = text[match.index! - 1], after = text[match.index! + value.length]
    if (visible.has(value) && before !== '.' && after !== '.' && before !== '@') tokens.push(value)
  }
  return unique(tokens)
}
export function toolsCheck(text: string, names: readonly string[]): LintCheck {
  if (names.length === 0) return check('tools', [finding('unknown', 'empty-tools', '当前会话工具集为空，暂未核实。')])
  const tokens = toolTokens(text, names)
  return check('tools', tokens.length === 0 ? [finding('ok', 'no-tools', '没有明确点名的工具。')]
    : tokens.map(token => names.includes(token) ? finding('ok', 'tool-found', '工具已在当前会话注册。', token)
      : finding('warn', 'tool-missing', `工具「${token}」未在当前会话注册。`, token)))
}

/** URLs, CIDR and ordinary alternatives are never filesystem paths. */
export function pathTokens(text: string): string[] {
  const clean = text.replace(/https?:\/\/[^\s`<>]+|\b\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}\b/g, ' ')
  const tokens: string[] = []
  for (const match of clean.matchAll(/(?:[A-Za-z]:)?(?:\.{1,2}[/\\]|[/\\])?[\w\u4e00-\u9fff.@+-]+(?:[/\\][\w\u4e00-\u9fff.@+-]+)*\/?/g)) {
    const value = match[0]
    const extension = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml|toml|md|txt|py|rs|go|html|css|csv|pdf|docx|sh|ps1)$/i.test(value)
    const quoted = clean[match.index! - 1] === '`' && clean[match.index! + value.length] === '`'
    const prefix = clean.slice(Math.max(0, match.index! - 16), match.index)
    if (extension || /[/\\]/.test(value) && (quoted || /路径|文件|目录|path|file|directory/i.test(prefix)
      || value.startsWith('.') || value.startsWith('/') || value.includes('\\'))) tokens.push(value)
  }
  return unique(tokens.filter(token => !['and/or', 'either/or'].includes(token)))
}
export function mentionTokens(text: string): string[] {
  return unique([...text.matchAll(/(?:^|[\s`（(，,：:])@([A-Za-z][A-Za-z0-9_-]{0,127})(?![\w-])/g)].map(match => match[1]))
}
export interface MentionName { name: string; modelInvocable?: boolean }
export function editDistance(left: string, right: string): number {
  if (Math.abs(left.length - right.length) > 2) return 3
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    const row = [i]
    for (let j = 1; j <= right.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1,
      previous[j - 1] + Number(left[i - 1] !== right[j - 1]))
    previous = row
  }
  return previous[right.length]
}
export function mentionsCheck(text: string, names: readonly MentionName[]): LintCheck {
  const tokens = mentionTokens(text)
  const findings = tokens.map(token => {
    const exact = names.find(item => item.name === token)
    if (exact) return exact.modelInvocable === false
      ? { ...finding('ok', 'manual-skill', '技能存在，但不可被模型自动调用；可由用户显式调用。', token), severity: 'info' as const }
      : finding('ok', 'mention-found', '已找到该技能或子代理。', token)
    const nearest = names.map(item => ({ name: item.name, distance: editDistance(token, item.name) }))
      .filter(item => item.distance <= 2).sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))[0]
    return { ...finding('warn', 'mention-missing', '未找到该技能或子代理。', token),
      ...(nearest ? { suggestion: nearest.name } : {}) }
  })
  return check('mentions', findings.length ? findings : [finding('ok', 'no-mentions', '没有需要核验的技能或子代理标识。')])
}
export function permissionsCheck(text: string, policy: 'ask' | 'never' | undefined): LintCheck {
  if (policy !== 'never') return check('permissions', [finding('ok', 'no-policy-warning', '未发现审批覆盖策略提示；这不代表任何操作已获授权。')])
  const reason = '当前会话审批策略为 never，需要授权的操作会被自动拒绝；未判断具体工具是否需要授权。'
  const item: LintFinding = ACTION.test(text) ? finding('warn', 'approval-never-action', reason)
    : { ...finding('ok', 'approval-never', reason), severity: 'info' }
  return check('permissions', [item])
}
export function deliverablesCheck(text: string): LintCheck {
  return check('deliverables', [OUTPUT.test(text) ? finding('ok', 'deliverable-found', '已指定交付物。')
    : { ...finding('ok', 'deliverable-optional', '未指定交付物形态（可选）。'), severity: 'info' }])
}

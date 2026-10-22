/** Public, content-free preflight vocabulary shared by Host and Client. */
export type LintCategory = 'tools' | 'paths' | 'mentions' | 'permissions' | 'deliverables'
export type LintState = 'ok' | 'warn' | 'unknown'
export interface LintFinding {
  state: LintState
  severity: 'none' | 'info' | 'warning'
  code: string
  reason: string
  token?: string
  suggestion?: string
}
export interface LintCheck { category: LintCategory; state: LintState; findings: LintFinding[] }
export interface LintReport { checks: LintCheck[]; elapsedMs: number }
export const LINT_CATEGORIES: readonly LintCategory[] = ['tools', 'paths', 'mentions', 'permissions', 'deliverables']

export function finding(state: LintState, code: string, reason: string, token?: string): LintFinding {
  return { state, severity: state === 'warn' ? 'warning' : 'none', code, reason, ...(token === undefined ? {} : { token }) }
}
export function check(category: LintCategory, findings: LintFinding[]): LintCheck {
  const state = findings.some(item => item.state === 'warn') ? 'warn'
    : findings.some(item => item.state === 'unknown') ? 'unknown' : 'ok'
  return { category, state, findings }
}
export function unknownCheck(category: LintCategory, code = 'unavailable'): LintCheck {
  return check(category, [finding('unknown', code, code === 'timeout' ? '检查超时，暂未核实。' : '当前无法核实，未推断为不存在或无权限。')])
}
/** Only verified warnings can influence a rewrite. Informational hints never do. */
export function rewriteFindings(report: LintReport): LintFinding[] {
  return report.checks.filter(item => item.category !== 'deliverables')
    .flatMap(item => item.findings.filter(value => value.state === 'warn' && value.severity === 'warning'))
}

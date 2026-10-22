import { posix, win32 } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-working-directory'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-agent'
import { untilAbort } from './cancellation.ts'
import { toolsCheck, pathTokens, mentionTokens, mentionsCheck, permissionsCheck, deliverablesCheck, isWriteRequest } from './lintRules.ts'
import { check, finding, LINT_CATEGORIES, unknownCheck, type LintCategory, type LintCheck, type LintReport } from './lintTypes.ts'

/** A deadline bounds providers which ignore cancellation; cancellation still reaches cooperative providers. */
export async function boundedCheck(category: LintCategory, task: (signal: AbortSignal) => Promise<LintCheck>,
  signal: AbortSignal, timeoutMs = 500): Promise<LintCheck> {
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(new Error('lint deadline')), timeoutMs)
  const combined = AbortSignal.any([signal, deadline.signal])
  try { return await untilAbort(Promise.resolve().then(() => { combined.throwIfAborted(); return task(combined) }), combined) }
  catch { if (signal.aborted) throw signal.reason; return unknownCheck(category, deadline.signal.aborted ? 'timeout' : 'unavailable') }
  finally { clearTimeout(timer) }
}

/** Lexical containment is checked BEFORE resolve, which may itself perform realpath I/O. */
export function lexicalPath(cwd: string, token: string): { path: string; inside: boolean; parts: string[]; flavor: typeof posix } {
  const flavor = /^[A-Za-z]:[\\/]|^\\\\/.test(cwd) ? win32 : posix
  if (!flavor.isAbsolute(cwd) || /\0/.test(token) || flavor === posix && /^(?:[A-Za-z]:|\\)/.test(token)) throw new Error('unsupported path world')
  const path = flavor.resolve(cwd, token)
  const relative = flavor.relative(cwd, path)
  const inside = relative === '' || relative !== '..' && !relative.startsWith(`..${flavor.sep}`) && !flavor.isAbsolute(relative)
  return { path, inside, parts: inside ? relative.split(flavor.sep).filter(Boolean) : [], flavor }
}

async function pathsCheck(ctx: Context, session: Session, text: string, signal: AbortSignal): Promise<LintCheck> {
  const tokens = pathTokens(text)
  if (!tokens.length) return check('paths', [finding('ok', 'no-paths', '没有需要核验的路径。')])
  const fs = ctx.get('fs'), cwdService = ctx.get('workingDirectory')
  if (!fs || !cwdService) return unknownCheck('paths')
  const cwd = cwdService.get(session)
  let root: Awaited<ReturnType<typeof fs.resolve>> | undefined
  const findings = []
  for (const token of tokens) {
    signal.throwIfAborted()
    const lexical = lexicalPath(cwd, token)
    if (!lexical.inside) {
      findings.push(isWriteRequest(text)
        ? finding('warn', 'path-outside', '路径在工作区外，当前策略可能拒绝写入；未访问该路径。', token)
        : { ...finding('unknown', 'path-outside-read', '路径在工作区外，未访问，存在性未核实。', token), severity: 'info' as const })
      continue
    }
    // Do not follow repository-owned symlinks/junctions. Resolve may follow them,
    // so every lexical component is probed without following its final link.
    let current = cwd, linked = false
    for (const part of lexical.parts) {
      current = lexical.flavor.join(current, part)
      const info = await untilAbort(fs.lstat(current, { cwd }, signal), signal)
      if (info?.type === 'symlink') { linked = true; break }
      if (!info) break
    }
    if (linked) { findings.push(finding('unknown', 'path-link', '路径包含符号链接或目录联接，未跟随，存在性未核实。', token)); continue }
    root ??= await untilAbort(fs.resolve(cwd, { cwd, signal }), signal)
    const target = await untilAbort(fs.resolve(token, { cwd, signal }), signal)
    signal.throwIfAborted()
    if (!fs.contains(root, target)) { findings.push(finding('unknown', 'path-identity-outside', '规范路径不在工作区内，未继续访问。', token)); continue }
    const info = await untilAbort(fs.stat(target, signal), signal)
    findings.push(info ? finding('ok', 'path-found', '路径存在。', token) : finding('warn', 'path-missing', '路径不存在。', token))
  }
  return check('paths', findings)
}

/** Each category gets at most 500ms, and all categories share a 1500ms overall deadline. */
export async function lintDraft(ctx: Context, session: Session, text: string, signal: AbortSignal,
  budget = { itemMs: 500, totalMs: 1500 }): Promise<LintReport> {
  signal.throwIfAborted()
  const started = Date.now(), deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(new Error('lint total deadline')), budget.totalMs)
  const combined = AbortSignal.any([signal, deadline.signal])
  // ScopeKey is identity-compared. A freshly constructed { id } silently reads
  // only global layers; use the actual registered Agent and never materialize one.
  const agent = ctx.get('agents')?.get(session.id)
  const scope = agent?.session === session ? agent : undefined
  const tasks: Record<LintCategory, (control: AbortSignal) => Promise<LintCheck>> = {
    tools: async () => {
      const service = ctx.get('tools')
      return service && scope ? toolsCheck(text, service.schemas(scope).map(item => item.name)) : unknownCheck('tools')
    },
    paths: control => pathsCheck(ctx, session, text, control),
    mentions: async control => {
      if (!mentionTokens(text).length) return mentionsCheck(text, [])
      const skills = ctx.get('skills'), subagents = ctx.get('subagents'), cwd = ctx.get('workingDirectory')
      if (!skills || !subagents || !cwd || !scope) return unknownCheck('mentions')
      const [catalog, children] = await Promise.all([
        skills.list({ scope, cwd: cwd.get(session), signal: control }),
        subagents.listChildren(session.id, control),
      ])
      // list() returns PROVIDER names, not child names; never advertise those as agents.
      subagents.list()
      return mentionsCheck(text, [...catalog.map(item => ({ name: item.name, modelInvocable: item.invocation.modelInvocable })),
        ...children.flatMap(item => [{ name: item.id }, ...(item.label ? [{ name: item.label }] : [])])])
    },
    permissions: async () => {
      const approval = ctx.get('approval')
      return approval ? permissionsCheck(text, approval.overrideOf(session)) : unknownCheck('permissions')
    },
    deliverables: async () => deliverablesCheck(text),
  }
  try {
    const checks = await Promise.all(LINT_CATEGORIES.map(async category => {
      try { return await boundedCheck(category, tasks[category], combined, budget.itemMs) }
      catch { if (signal.aborted) throw signal.reason; return unknownCheck(category, 'timeout') }
    }))
    signal.throwIfAborted()
    return { checks, elapsedMs: Date.now() - started }
  } finally { clearTimeout(timer) }
}

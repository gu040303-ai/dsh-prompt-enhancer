import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { createScope } from '@deepseek-ai/dsh-scope'
import { lintDraft, boundedCheck, lexicalPath } from '../src/lint.ts'
import { toolsCheck, pathTokens, mentionsCheck, permissionsCheck, deliverablesCheck } from '../src/lintRules.ts'
import { LINT_CATEGORIES, unknownCheck, rewriteFindings } from '../src/lintTypes.ts'
import { sentenceReview, assembleReview } from '../src/selection.ts'

for (const text of ['调用工具 `read_file`', '使用 read_file 读取', '`read_file`']) {
  test(`exact visible tool: ${text}`, () => assert.equal(toolsCheck(text, ['read_file']).findings[0].code, 'tool-found'))
}
for (const text of ['搜索一下', '读一下这个文件', '`ctx.tools` 与 `useInput` 是 API']) {
  test(`prose is not a tool: ${text}`, () => assert.equal(toolsCheck(text, ['read_file']).findings[0].code, 'no-tools'))
}
test('explicit missing tools preserve case and hyphens', () => {
  for (const name of ['Read_File', 'read-file', 'missing_tool']) {
    const result = toolsCheck(`工具 \`${name}\``, ['read_file'])
    assert.equal(result.state, 'warn'); assert.equal(result.findings[0].token, name)
  }
})
test('empty tool catalog is unknown', () => assert.equal(toolsCheck('工具 `read_file`', []).state, 'unknown'))

for (const token of ['src/main.ts', 'config.yaml', 'C:\\work\\a.txt']) {
  test(`path token: ${token}`, () => assert.deepEqual(pathTokens(`请修改 \`${token}\``), [token]))
}
for (const text of ['https://example.com/src/main.ts', '10.0.0.1/24', 'and/or']) {
  test(`not a path: ${text}`, () => assert.deepEqual(pathTokens(text), []))
}
test('lexical containment respects session cwd and Windows volume boundaries', () => {
  assert.equal(lexicalPath('C:\\work', 'src/a.ts').path, 'C:\\work\\src\\a.ts')
  for (const token of ['../secret.txt', 'D:\\other\\secret.txt', 'C:\\workspace\\secret.txt']) {
    assert.equal(lexicalPath('C:\\work', token).inside, false)
  }
  assert.equal(lexicalPath('/work', '../secret.txt').inside, false)
})
for (const name of ['writer', 'coder', 'reviewer']) {
  test(`known mention: ${name}`, () => assert.equal(mentionsCheck(`@${name}`, [{ name }]).state, 'ok'))
}
for (const text of ['@某人', '@团队', 'mail@example.com']) {
  test(`non-agent mention ignored: ${text}`, () => assert.equal(mentionsCheck(text, []).findings[0].code, 'no-mentions'))
}
test('missing mention gets only one close suggestion and remains case sensitive', () => {
  const result = mentionsCheck('@writee', [{ name: 'writer' }, { name: 'writed' }])
  assert.equal(result.state, 'warn'); assert.equal(typeof result.findings[0].suggestion, 'string')
  assert.equal(mentionsCheck('@Writer', [{ name: 'writer' }]).state, 'warn')
})
test('manual-only skill exists and is informational', () => {
  const result = mentionsCheck('@writer', [{ name: 'writer', modelInvocable: false }])
  assert.equal(result.state, 'ok'); assert.equal(result.findings[0].severity, 'info')
  assert.match(result.findings[0].reason, /不可被模型自动调用/)
})
for (const text of ['写文件', '执行命令', '联网下载']) {
  test(`never policy warns for action: ${text}`, () => {
    const result = permissionsCheck(text, 'never')
    assert.equal(result.state, 'warn')
    assert.doesNotMatch(result.findings[0].reason, /会被拒绝|会失败/)
  })
}
for (const policy of ['ask', undefined] as const) {
  test(`approval ${policy} does not claim permission or refusal`, () => {
    assert.equal(permissionsCheck('写文件并联网执行', policy).state, 'ok')
  })
}
test('never policy with no action is informational', () => {
  const result = permissionsCheck('你好', 'never')
  assert.equal(result.state, 'ok'); assert.equal(result.findings[0].severity, 'info')
})
for (const text of ['输出表格', '以 JSON 返回', '写入 report.md']) {
  test(`explicit deliverable: ${text}`, () => assert.equal(deliverablesCheck(text).findings[0].code, 'deliverable-found'))
}
for (const text of ['你好', '帮我想想', '解释一下']) {
  test(`optional deliverable: ${text}`, () => {
    const result = deliverablesCheck(text)
    assert.equal(result.state, 'ok'); assert.equal(result.findings[0].severity, 'info')
    assert.deepEqual(rewriteFindings({ checks: [result], elapsedMs: 0 }), [])
  })
}
for (const category of LINT_CATEGORIES) {
  test(`${category}: backend exception is unknown`, async () => {
    const result = await boundedCheck(category, async () => { throw new Error('secret backend payload') }, new AbortController().signal)
    assert.equal(result.state, 'unknown'); assert.doesNotMatch(JSON.stringify(result), /secret backend/)
  })
  test(`${category}: noncooperative backend timeout is unknown`, async () => {
    const result = await boundedCheck(category, () => new Promise(() => {}), new AbortController().signal, 8)
    assert.equal(result.findings[0].code, 'timeout')
  })
}

function environment(overrides: Record<string, unknown> = {}) {
  const session = { id: 'session-a' }, agent = { id: 'session-a', session }, calls: string[] = []
  const services = {
    agents: { get: id => id === session.id ? agent : undefined },
    tools: { schemas: scope => { assert.equal(scope, agent); return [{ name: 'read_file' }] } },
    workingDirectory: { get: value => { assert.equal(value, session); return '/work' } },
    fs: {
      resolve: async (value, options) => { calls.push(`resolve:${value}`); assert.equal(options.cwd, '/work'); return { targetKey: value, displayPath: value } },
      lstat: async value => { calls.push(`lstat:${value}`); return { type: 'directory' } },
      contains: () => true,
      stat: async target => { calls.push(`stat:${target.targetKey}`); return target.targetKey.includes('missing') ? undefined : { type: 'file' } },
    },
    skills: { list: async options => { assert.equal(options.scope, agent); return [{ name: 'writer', invocation: { modelInvocable: false } }] } },
    subagents: { list: () => ['spawn'], listChildren: async () => [{ id: 'child-id', label: 'coder' }] },
    approval: { overrideOf: () => 'ask' },
    ...overrides,
  }
  return { ctx: { get: key => services[key] } as any, session: session as any, calls, services }
}
test('Host path checks use session cwd and distinguish present / absent', async () => {
  const env = environment()
  const result = await lintDraft(env.ctx, env.session, '修改 `src/main.ts` 和 `src/missing.ts`', new AbortController().signal)
  const findings = result.checks.find(item => item.category === 'paths')!.findings
  assert.deepEqual(findings.map(item => item.code), ['path-found', 'path-missing'])
})
test('outside paths cause zero filesystem I/O, even resolve', async () => {
  const env = environment()
  const result = await lintDraft(env.ctx, env.session, '修改 `../secret.txt`', new AbortController().signal)
  assert.equal(result.checks.find(item => item.category === 'paths')!.state, 'warn')
  assert.deepEqual(env.calls, [])
})
test('read-only outside path is unknown, with no I/O', async () => {
  const env = environment()
  const result = await lintDraft(env.ctx, env.session, '读取 `../secret.txt`', new AbortController().signal)
  assert.equal(result.checks.find(item => item.category === 'paths')!.state, 'unknown')
  assert.deepEqual(env.calls, [])
})
test('symbolic links are not resolved or followed', async () => {
  const env = environment()
  env.services.fs.lstat = async value => { env.calls.push(`lstat:${value}`); return { type: 'symlink' } }
  const result = await lintDraft(env.ctx, env.session, '修改 `link/outside.ts`', new AbortController().signal)
  assert.equal(result.checks.find(item => item.category === 'paths')!.findings[0].code, 'path-link')
  assert.deepEqual(env.calls, ['lstat:/work/link'])
})
test('resolve or stat errors degrade only the paths category', async () => {
  for (const method of ['resolve', 'stat'] as const) {
    const env = environment()
    env.services.fs[method] = async () => { throw new Error('backend failure') }
    const result = await lintDraft(env.ctx, env.session, '查看 `foo/bar`', new AbortController().signal)
    assert.equal(result.checks.find(item => item.category === 'paths')!.state, 'unknown')
    assert.equal(result.checks.find(item => item.category === 'tools')!.state, 'ok')
  }
})
test('skills and child labels are combined; provider names are not agents', async () => {
  const env = environment()
  const result = await lintDraft(env.ctx, env.session, '@writer @coder @spawn', new AbortController().signal)
  const values = result.checks.find(item => item.category === 'mentions')!.findings
  assert.deepEqual(values.map(item => item.code), ['manual-skill', 'mention-found', 'mention-missing'])
})
test('total deadline returns settled checks alongside unknown slow checks', async () => {
  const env = environment({ skills: { list: () => new Promise(() => {}) } })
  const start = Date.now()
  const result = await lintDraft(env.ctx, env.session, '@writer', new AbortController().signal, { itemMs: 100, totalMs: 12 })
  assert.ok(Date.now() - start < 150)
  assert.equal(result.checks.find(item => item.category === 'mentions')!.state, 'unknown')
  assert.equal(result.checks.find(item => item.category === 'deliverables')!.state, 'ok')
})
test('caller cancellation is immediate and reaches the provider', async () => {
  let observed: AbortSignal | undefined
  const env = environment({ skills: { list: options => { observed = options.signal; return new Promise(() => {}) } } })
  const control = new AbortController()
  const result = lintDraft(env.ctx, env.session, '@writer', control.signal)
  await new Promise(resolve => setTimeout(resolve, 5)); control.abort(new Error('caller cancelled'))
  await assert.rejects(result, /caller cancelled/); assert.equal(observed?.aborted, true)
})
test('missing live Agent does not fall back to global tools or fabricate a scope', async () => {
  const env = environment({ agents: { get: () => undefined } })
  const result = await lintDraft(env.ctx, env.session, '工具 `read_file`', new AbortController().signal)
  assert.equal(result.checks.find(item => item.category === 'tools')!.state, 'unknown')
})
test('two actual rc.2 scoped tool catalogs stay separate by Agent identity', async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose())
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime)
  const first = { id: 'first' }, second = { id: 'second' }
  const a = { id: first.id, session: first }, b = { id: second.id, session: second }
  ctx.reflect.provide('agents', { get: id => id === first.id ? a : b } as any)
  const definition = name => ({ name, description: name, parameters: { type: 'object' },
    output: { schema: { type: 'null' }, render: () => [] }, execute: async () => null })
  await ctx.plugin(Object.assign((inner: Context) => {
    createScope(inner, a).ctx.tools.register(definition('first_tool'))
    createScope(inner, b).ctx.tools.register(definition('second_tool'))
  }, { inject: ['tools', 'systemPrompt'] }))
  const one = await lintDraft(ctx, first as any, '工具 `first_tool`', new AbortController().signal)
  const two = await lintDraft(ctx, second as any, '工具 `first_tool`', new AbortController().signal)
  assert.equal(one.checks[0].state, 'ok'); assert.equal(two.checks[0].state, 'warn')
})
test('all checked and unchecked sentence choices preserve exact text including whitespace', () => {
  const before = ' 第一段。\r\n第二句！\n  第三句?\n', after = ' 新的第一段。\r\n新的第二句！\n  第三句?\n'
  const review = sentenceReview(before, after)
  assert.equal(assembleReview(review, new Set()), before)
  assert.equal(assembleReview(review, new Set(review.choices.map(item => item.id))), after)
  const first = review.choices.find(item => !item.same)!
  const mixed = assembleReview(review, new Set([first.id]))
  assert.ok(mixed.includes('新的第一段')); assert.ok(mixed.includes('第二句！'))
})
test('sentence selection handles insertion and deletion independently', () => {
  for (const [before, after] of [['保留。', '保留。新增。'], ['删除。保留。', '保留。'], ['', '新增。'], ['删除。', '']]) {
    const review = sentenceReview(before, after)
    assert.equal(assembleReview(review, new Set()), before)
    assert.equal(assembleReview(review, new Set(review.choices.map(item => item.id))), after)
  }
})
test('oversized sentence selection refuses unsafe allocation', () => {
  const review = sentenceReview('甲。'.repeat(1500), '乙。'.repeat(1500))
  assert.equal(review.truncated, true); assert.throws(() => assembleReview(review, new Set()))
})

test('paragraph spacing is selectable with its sentence without empty checkbox rows', () => {
  const before = '原句。', after = '标题\n\n新的第一句。\n\n新的第二句。'
  const review = sentenceReview(before, after)
  assert.ok(review.choices.every(item => item.before.trim() || item.after.trim()))
  assert.equal(assembleReview(review, new Set()), before)
  assert.equal(assembleReview(review, new Set(review.choices.map(item => item.id))), after)
})

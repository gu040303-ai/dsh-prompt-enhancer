import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, LlmRuntime, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import TypertGateway from '@deepseek-ai/dsh-api-gateway'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import Plugin from '../lib/index.js'
import { enhanceDraft, EnhancementError, untilAbort } from '../src/enhance.ts'
import { LINT_CATEGORIES, unknownCheck } from '../src/lintTypes.ts'

const config = { timeoutMs: 1000, maxInputBytes: 65536, maxOutputTokens: 4096, maxConcurrentRequests: 2 }
const request = { text: '帮我把计划写清楚，保留预算 200 元。', selection: { provider: 'existing-provider', model: 'existing-model' } }
const full = (text = '请制定清晰的行动计划，预算不超过 200 元。'): StreamChunk[] => [
  { type: 'text-delta', index: 0, text }, { type: 'finish', reason: { kind: 'stop' } },
]
class Adapter extends LlmAdapter {
  calls: GenerateOptions[] = []
  chunks = full()
  failure: Error | null = null
  hang = false
  stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options)
    const self = this
    return (async function* () {
      if (self.failure) throw self.failure
      if (self.hang) { await new Promise(() => {}); return }
      yield* self.chunks
    })()
  }
}
async function setup(t: TestContext) {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(RemoteAccess)
  await ctx.plugin(TypertGateway)
  const adapter = new Adapter()
  ctx.llm.registerAdapter(['existing-provider'], adapter)
  const fiber = ctx.plugin(Plugin, config)
  await fiber
  const events: any[] = []
  ctx.on('session/event', (_session, event) => { events.push(event) })
  const session = ctx.sessions.create()
  const peer = new Peer(ctx, { principal: { kind: 'owner' } })
  const invoke = (value = request, signal?: AbortSignal) => ctx.typertGateway.invoke({
    namespace: 'promptEnhancer', method: 'enhance', args: { sessionId: session.id, request: value }, peer, signal,
  })
  return { ctx, session, adapter, fiber, invoke, peer, events }
}

test('rc.2 Gateway dispatches the built plugin with host-selected route and no tools or agent turn', async t => {
  const { ctx, session, adapter, invoke, events } = await setup(t)
  const result = await invoke()
  assert.deepEqual(result, { text: '请制定清晰的行动计划，预算不超过 200 元。' })
  assert.equal(adapter.calls.length, 1)
  const call = adapter.calls[0]
  assert.equal(call.provider, request.selection.provider)
  assert.equal(call.model, request.selection.model)
  assert.equal(call.maxTokens, 4096)
  assert.equal(call.tools, undefined)
  assert.equal(call.sessionId, session.id)
  assert.match(call.system!, /不编造/)
  assert.equal(call.messages[0].role, 'user')
  assert.ok(call.messages[0].content[0].text.includes(JSON.stringify(request.text)))
  const record = events.find(event => event.type === 'plugin:prompt-enhancer/request')
  assert.ok(record)
  assert.equal(record.ignorable, true)
  assert.equal(record.data.system, call.system)
  assert.deepEqual(record.data.messages, call.messages)
  assert.equal(events.some(event => event.type === 'turn/start' || event.type === 'user/message'), false)
  assert.ok(ctx.typert.local.get('promptEnhancer/enhance'))
})

test('Gateway enforces strict input codecs before any model call', async t => {
  const { adapter, invoke } = await setup(t)
  const invalid = { ...request, endpoint: 'must-not-accept-an-endpoint' }
  await assert.rejects(invoke(invalid), error => remoteErrorOf(error)?.code === 'gateway/input-invalid')
  assert.equal(adapter.calls.length, 0)
})

test('Gateway returns Harness plain text even when the model adds Markdown presentation', async t => {
  const { adapter, invoke } = await setup(t)
  adapter.chunks = full('# 任务目标\n\n请制定**项目计划**，预算 **200 元**。\n\n| 内容 | 要求 |\n| --- | --- |\n| 输出 | 普通文本 |')
  const result = await invoke() as any
  assert.equal(result.text, '任务目标\n\n请制定项目计划，预算 200 元。\n\n内容：输出；要求：普通文本')
  assert.match(adapter.calls[0].system!, /纯文本输入框/)
})

test('authenticated lint Remote is read-only and invokes no model', async t => {
  const { ctx, session, peer, adapter, events } = await setup(t)
  const result = await ctx.typertGateway.invoke({ namespace: 'promptEnhancer', method: 'lint',
    args: { sessionId: session.id, request: { text: '输出 JSON 表格' } }, peer }) as any
  assert.equal(result.checks.length, 5); assert.equal(adapter.calls.length, 0)
  assert.equal(events.some(event => event.type === 'plugin:prompt-enhancer/request'), false)
})
test('conditional enhancement revalidates forged browser facts before model call', async t => {
  const { invoke, adapter } = await setup(t)
  const lint = { checks: LINT_CATEGORIES.map(category => unknownCheck(category)), elapsedMs: 0 }
  lint.checks[0] = { category: 'tools', state: 'warn', findings: [{ state: 'warn', severity: 'warning',
    code: 'forged', reason: 'DO_NOT_TRUST_BROWSER_REPORT' }] }
  await invoke({ ...request, lint } as any)
  assert.doesNotMatch(adapter.calls[0].messages[0].content[0].text, /DO_NOT_TRUST_BROWSER_REPORT/)
})
test('conditional enhancement includes only freshly verified warnings, never deliverable hints', async t => {
  const { ctx, invoke, adapter } = await setup(t)
  ctx.reflect.provide('approval', { overrideOf: () => 'never' } as any)
  const lint = { checks: LINT_CATEGORIES.map(category => unknownCheck(category)), elapsedMs: 0 }
  await invoke({ ...request, text: '请写文件', lint } as any)
  const payload = JSON.parse(adapter.calls[0].messages[0].content[0].text)
  assert.equal(payload.preflight.length, 1); assert.equal(payload.preflight[0].code, 'approval-never-action')
  assert.doesNotMatch(JSON.stringify(payload.preflight), /未指定交付物/)
})

test('Client policy reads Host limits through an authenticated Session lookup without calling a model', async t => {
  const { ctx, session, adapter, peer } = await setup(t)
  const result = await ctx.typertGateway.invoke({ namespace: 'promptEnhancer', method: 'policy',
    args: { sessionId: session.id }, peer })
  assert.deepEqual(result, { timeoutMs: config.timeoutMs })
  assert.equal(adapter.calls.length, 0)
})

test('uninstall removes only its endpoint; reinstall restores it', async t => {
  const { ctx, fiber, invoke, adapter } = await setup(t)
  await fiber.dispose()
  assert.equal(ctx.typert.local.get('promptEnhancer/enhance'), undefined)
  assert.equal(ctx.llm.listProviders().length, 1)
  await assert.rejects(invoke())
  const reinstall = ctx.plugin(Plugin, config)
  await reinstall
  await invoke()
  assert.equal(adapter.calls.length, 1)
})

test('model failures are readable and never expose raw provider details', async t => {
  const { adapter, invoke } = await setup(t)
  adapter.failure = new Error('sensitive-provider-payload')
  await assert.rejects(invoke(), error => {
    const failure = remoteErrorOf(error)
    assert.equal(failure?.code, 'prompt-enhancer/rejected')
    assert.match(failure!.message, /原始输入已保留/)
    assert.equal(failure!.message.includes('sensitive-provider-payload'), false)
    return true
  })
})

for (const [label, chunks, reason] of [
  ['truncated', [{ type: 'text-delta', index: 0, text: 'partial' }, { type: 'finish', reason: { kind: 'max-tokens' } }], 'incomplete-output'],
  ['unterminated', [{ type: 'text-delta', index: 0, text: 'partial' }], 'incomplete-output'],
  ['empty', [{ type: 'finish', reason: { kind: 'stop' } }], 'empty-output'],
  ['reasoning only', [{ type: 'reasoning-delta', index: 0, text: 'private reasoning' }, { type: 'finish', reason: { kind: 'stop' } }], 'empty-output'],
] as const) {
  test(`reject ${label} output instead of replacing the draft`, async t => {
    const { adapter, invoke } = await setup(t)
    adapter.chunks = [...chunks] as StreamChunk[]
    await assert.rejects(invoke(), error => remoteErrorOf(error)?.details.reason === reason)
  })
}

test('timeout bounds an adapter that ignores AbortSignal, and clears its concurrency slot', async t => {
  const { adapter, invoke } = await setup(t)
  adapter.hang = true
  const started = Date.now()
  await assert.rejects(invoke(), error => remoteErrorOf(error)?.details.reason === 'timeout')
  assert.ok(Date.now() - started < 3000)
  adapter.hang = false
  await invoke()
})

test('duplicate request is rejected; caller cancellation preserves the next request', async t => {
  const { adapter, invoke } = await setup(t)
  adapter.hang = true
  const controller = new AbortController()
  const first = invoke(request, controller.signal)
  const rejection = assert.rejects(first)
  await new Promise(resolve => setTimeout(resolve, 20))
  await assert.rejects(invoke(), error => remoteErrorOf(error)?.details.reason === 'busy')
  controller.abort()
  await rejection
  adapter.hang = false
  await invoke()
})

test('unloading aborts a running call without disabling the model service', async t => {
  const { ctx, adapter, fiber, invoke } = await setup(t)
  adapter.hang = true
  const pending = assert.rejects(invoke())
  await new Promise(resolve => setTimeout(resolve, 20))
  await fiber.dispose()
  await pending
  assert.equal(adapter.calls[0].signal?.aborted, true)
  assert.equal(ctx.llm.listProviders().length, 1)
})

test('UTF-8 input limit and whitespace rejection happen before preparation', async t => {
  const { ctx, adapter } = await setup(t)
  const signal = new AbortController().signal
  await assert.rejects(enhanceDraft(ctx.llm, { ...request, text: '  \n ' }, config, undefined, signal, () => {}),
    error => error instanceof EnhancementError && error.reason === 'empty-input')
  await assert.rejects(enhanceDraft(ctx.llm, { ...request, text: '中文' }, { ...config, maxInputBytes: 5 }, undefined, signal, () => {}),
    error => error instanceof EnhancementError && error.reason === 'input-too-long')
  assert.equal(adapter.calls.length, 0)
})

test('preparation can be cancelled even when it never settles', async () => {
  const controller = new AbortController()
  const pending = assert.rejects(untilAbort(new Promise(() => {}), controller.signal))
  controller.abort(new Error('cancelled'))
  await pending
})

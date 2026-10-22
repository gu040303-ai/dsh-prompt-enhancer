import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React, { useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true })
const require = createRequire(import.meta.url)
const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const primitives = {
  Button: ({ children, variant, size, ...props }) => React.createElement('button', props, children),
  Tooltip: ({ children }) => children,
  Menu: ({ anchor, open, children }) => React.createElement('span', null, anchor, open && React.createElement('div', { role: 'menu' }, children)),
  MenuItemButton: ({ children, disabled, onSelect }) => React.createElement('button', { role: 'menuitem', disabled, onClick: onSelect }, children),
}
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const report = { checks: ['tools', 'paths', 'mentions', 'permissions', 'deliverables'].map(category => ({ category,
  state: category === 'tools' ? 'warn' : 'unknown', findings: [{ state: category === 'tools' ? 'warn' : 'unknown',
    severity: category === 'tools' ? 'warning' : 'none', reason: '本地检查结果', code: 'test' }] })), elapsedMs: 1 }

async function fixture(t, options: { text?: string; phase?: string; refs?: any[]; allowed?: boolean; available?: boolean } = {}) {
  let plugin, dictionary
  vm.runInNewContext(code, { window: { __ModuleLoader__: { load({ factory }) {
    plugin = factory(name => name === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require(name))
  } } }, document, AbortController, AbortSignal, console, setTimeout, clearTimeout })
  const registrations: any[] = [], disposers: (() => void)[] = []
  const ctx = {
    locale: { register(_ns, value) { dictionary = value.zh; return () => {} }, bind: () => key => dictionary[key] ?? key },
    sidebarRightTabs: { register: () => () => {} }, sidebarRight: { mounted: { getSnapshot: () => 'session-a' }, openTab() {} },
    remote: { $mount: async () => async () => {} }, sessions: { subagentAddress: () => undefined },
    slots: { inject(_name, producer) { disposers.push(producer()) }, register(entry, component) { registrations.push({ ...entry, component }); return () => {} } },
    effect(producer) { disposers.push(producer()) },
    inject(_deps, callback) { callback(ctx); return Object.assign(Promise.resolve(), { dispose: async () => {
      for (const dispose of disposers.splice(0).reverse()) dispose?.()
    } }) },
  }
  const dispose = await plugin.apply(ctx)
  let state = { input: { draft: options.text ?? '请制定预算 200 元的计划。', draftRev: 1, phase: options.phase ?? 'plain',
    occurrences: options.refs ?? [], attachmentIds: ['unchanged'] }, sessionId: 'session-a', open: false,
    allowed: options.allowed ?? true, mounted: true }
  const listeners = new Set<() => void>(), requests: any[] = []
  let writes = 0, checks = 0
  const update = change => { state = { ...state, ...change }; listeners.forEach(fn => fn()) }
  const snapshot = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => state)
  const t9n = (key, params = {}) => (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match)
  const injected = {
    available: options.available ?? true,
    openPanel(view = 'result') { plugin.workflow.openView(state.sessionId, view); update({ open: true }) },
    async lint(_text, signal) { signal.throwIfAborted(); checks++; return report },
    enhance(text, signal, lint) { const pending = deferred<{ text: string }>(); requests.push({ text, signal, lint, pending }); return pending.promise },
  }
  const actions = { insertText(text, span) {
    if (span.draftRev !== state.input.draftRev || state.input.phase !== 'plain') return false
    assert.equal(span.end, state.input.draft.length)
    writes++; update({ input: { ...state.input, draft: text, draftRev: state.input.draftRev + 1 } }); return true
  }, submit() { throw new Error('An enhancement must never send a message') } }
  function App() {
    const value = snapshot()
    const props = { ...injected, sessionId: value.sessionId, inputActions: actions, t: t9n,
      useInput: selector => selector(snapshot().input), useSession: selector => selector({ removed: false }),
      useAccess: () => snapshot().allowed, useTabInfo: () => ({ tab: { visible: snapshot().open } }) }
    return <div>{value.mounted && React.createElement(plugin.EnhanceLauncher, props)}
      {React.createElement(plugin.EnhanceFeedback, props)}
      <div hidden={!value.open}>{value.open && React.createElement(plugin.EnhancePanel, props)}</div>
    </div>
  }
  const view = render(<App />)
  t.after(async () => { cleanup(); await act(async () => { await dispose() }) })
  const action = (name: string) => view.getByRole('button', { name, exact: true })
  return { plugin, ctx, view, registrations, get input() { return state.input }, get writes() { return writes },
    get calls() { return requests.length }, get checks() { return checks }, get open() { return state.open },
    get request() { return requests.at(-1)! }, get outcome() { return plugin.resultStore.snapshot(state.sessionId) },
    action, click() { fireEvent.click(action('增强提示词')) },
    menu(name: string) { fireEvent.click(action('优化选项')); fireEvent.click(view.getByRole('menuitem', { name, exact: true })) },
    edit(text: string) { act(() => update({ input: { ...state.input, draft: text, draftRev: state.input.draftRev + 1 } })) },
    close() { act(() => update({ open: false })) },
    session(id: string) { act(() => update({ sessionId: id, open: false })) },
    unmountOwner() { act(() => update({ mounted: false })) },
    async settle(text: string) { await act(async () => { requests.at(-1)!.pending.resolve({ text }); await Promise.resolve() }) },
    async fail(error: unknown) { await act(async () => { requests.at(-1)!.pending.reject(error); await Promise.resolve() }) },
  }
}

test('compiled client registers composer launcher, quiet feedback and native sidebar with disposable styles', async t => {
  const f = await fixture(t)
  assert.deepEqual(f.registrations.map(r => r.name), ['conversation.input.right', 'conversation.input.dock', 'sidebar.right.pane.tab'])
  assert.equal(document.querySelectorAll('style[data-plugin="dsh-prompt-enhancer"]').length, 1)
})
test('one click writes a plain result in one transaction without opening the sidebar', async t => {
  const f = await fixture(t); f.click(); f.click()
  assert.equal(f.calls, 1); assert.equal(f.writes, 0); assert.equal(f.open, false)
  await f.settle('# 项目计划\n明确**预算 200 元**并列出步骤。')
  assert.equal(f.input.draft, '项目计划\n明确预算 200 元并列出步骤。')
  assert.equal(f.writes, 1); assert.equal(f.open, false)
  assert.deepEqual(f.input.attachmentIds, ['unchanged'])
  fireEvent.click(f.action('撤销')); assert.equal(f.input.draft, '请制定预算 200 元的计划。')
})
test('preview menu starts generation immediately and writes only on Apply', async t => {
  const f = await fixture(t, { text: '原句一。原句二。' })
  f.menu('先预览再应用'); assert.equal(f.calls, 1); assert.equal(f.open, true)
  await f.settle('改句一。改句二。'); assert.equal(f.writes, 0)
  fireEvent.click(f.view.getByRole('tab', { name: '逐句对比' }))
  const boxes = f.view.getAllByRole('checkbox'); fireEvent.click(boxes[1])
  assert.equal(f.writes, 0)
  fireEvent.click(f.action('应用改动')); assert.equal(f.input.draft, '改句一。原句二。'); assert.equal(f.writes, 1)
})
test('local checks are explicit, disclose unknowns and never call the model', async t => {
  const f = await fixture(t); f.menu('查看本地检查')
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)) })
  assert.equal(f.calls, 0); assert.equal(f.checks, 1); assert.equal(f.writes, 0)
  assert.ok(f.view.container.querySelector('.dsh-pe-checks')!.open)
  assert.match(f.view.container.textContent!, /1 项提醒 · 4 项未核实/)
})
test('conditional optimization runs local verification then optimizes in the same menu action', async t => {
  const f = await fixture(t); f.menu('按检查结果优化')
  await act(async () => { await Promise.resolve() })
  assert.equal(f.calls, 1); assert.equal(f.request.lint, report)
  await f.settle('请在 200 元内列出项目步骤。'); assert.equal(f.writes, 1); assert.equal(f.open, false)
})
test('missing original details stop quick write-back and open a review', async t => {
  const f = await fixture(t); f.click(); await f.settle('制定项目计划。')
  assert.equal(f.writes, 0); assert.equal(f.open, true)
  assert.equal(f.outcome.reviewReason, 'facts')
  fireEvent.click(f.action('补回细节')); assert.equal(f.writes, 0)
  assert.ok(f.outcome.enhanced.includes('200')); assert.doesNotMatch(f.outcome.enhanced, /`/)
  fireEvent.click(f.action('应用改动')); assert.equal(f.writes, 1)
})
test('editing away and back invalidates a preview revision', async t => {
  const f = await fixture(t); f.menu('先预览再应用'); await f.settle('预算 200 元，列出步骤。')
  f.edit('临时'); f.edit('请制定预算 200 元的计划。')
  assert.equal(f.action('应用改动').disabled, true); fireEvent.click(f.action('应用改动')); assert.equal(f.writes, 0)
})
test('editing while pending cancels and preserves the new draft', async t => {
  const f = await fixture(t); f.click(); const old = f.request
  f.edit('用户的新内容'); assert.equal(old.signal.aborted, true)
  await f.settle('旧结果 200'); assert.equal(f.input.draft, '用户的新内容'); assert.equal(f.writes, 0)
})
test('explicit cancellation permits a new request even when the previous provider ignores abort', async t => {
  const f = await fixture(t); f.click(); const old = f.request
  fireEvent.click(f.action('取消')); assert.equal(old.signal.aborted, true)
  f.click(); assert.equal(f.calls, 2)
  await act(async () => { old.pending.resolve({ text: '旧结果 200' }) })
  await f.settle('新结果保留 200。'); assert.equal(f.input.draft, '新结果保留 200。')
})
test('closing preview cancels its request but closing details does not cancel quick optimization', async t => {
  const f = await fixture(t); f.menu('先预览再应用'); const first = f.request
  f.close(); assert.equal(first.signal.aborted, true)
  f.menu('查看本地检查')
  f.click(); const quick = f.request
  f.close(); assert.equal(quick.signal.aborted, false)
  await f.settle('保留预算 200 元，列出步骤。'); assert.equal(f.writes, 1)
})
test('session switch and owner unmount abort without a cross-session write', async t => {
  const f = await fixture(t); f.click(); const first = f.request
  f.session('session-b'); assert.equal(first.signal.aborted, true)
  await f.settle('旧会话 200'); assert.equal(f.writes, 0)
  f.click(); const second = f.request; f.unmountOwner(); assert.equal(second.signal.aborted, true)
  await f.settle('已卸载 200'); assert.equal(f.writes, 0)
})
test('retry after Apply returns a preview and cannot overwrite the applied draft', async t => {
  const f = await fixture(t); f.click(); await f.settle('第一版保留 200。')
  fireEvent.click(f.action('查看改动')); fireEvent.click(f.action('重新优化'))
  assert.equal(f.request.text, '请制定预算 200 元的计划。')
  await f.settle('第二版保留 200。'); assert.equal(f.input.draft, '第一版保留 200。'); assert.equal(f.writes, 1)
  fireEvent.click(f.action('应用改动')); assert.equal(f.input.draft, '第二版保留 200。')
})
test('unchecking every sentence keeps the original without creating an editor transaction', async t => {
  const f = await fixture(t, { text: '原句。' }); f.menu('先预览再应用'); await f.settle('改句。')
  fireEvent.click(f.view.getByRole('tab', { name: '逐句对比' })); fireEvent.click(f.view.getByRole('checkbox'))
  fireEvent.click(f.action('应用改动')); assert.equal(f.input.draft, '原句。'); assert.equal(f.writes, 0)
})
test('failure is inline and keeps all original characters', async t => {
  const f = await fixture(t); f.click(); await f.fail({ details: { reason: 'timeout' } })
  assert.equal(f.writes, 0); assert.match(f.view.container.textContent!, /优化超时/)
})
test('unchanged output creates no transaction', async t => {
  const f = await fixture(t); f.click(); await f.settle(f.input.draft)
  assert.equal(f.writes, 0); assert.match(f.view.container.textContent!, /无需修改/)
})

test('clearing the composer removes its quick result even when the sidebar was never opened', async t => {
  const f = await fixture(t); f.click(); await f.settle('保留 200 元，列出步骤。')
  assert.equal(f.open, false); assert.ok(f.outcome)
  f.edit(''); assert.equal(f.outcome, undefined)
  assert.equal(f.view.container.querySelector('.dsh-pe-feedback'), null)
})
for (const [name, options] of [ ['empty', { text: ' ' }], ['command', { phase: 'claimed' }],
  ['references', { refs: [{}] }], ['access denied', { allowed: false }], ['subagent', { available: false }] ] as const) {
  test(`${name} never invokes the model`, async t => { const f = await fixture(t, options)
    assert.equal(f.action('增强提示词').disabled, true); f.click(); assert.equal(f.calls, 0) })
}

test('preview is clean by default and checks stay collapsed until requested', async t => {
  const f = await fixture(t); f.menu('先预览再应用'); await f.settle('预算 200 元，输出计划。')
  assert.equal(f.view.getByRole('tab', { name: '结果' }).getAttribute('aria-selected'), 'true')
  assert.equal(f.view.queryAllByRole('checkbox').length, 0)
  assert.equal(f.view.container.querySelector('.dsh-pe-checks')!.open, false)
})

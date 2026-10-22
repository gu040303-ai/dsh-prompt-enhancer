// Component fixture: real rc.2 editor, primitives, toolbar CSS and theme.
// This is deliberately not a launched Harness app or a live model call.
import React, { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import * as ReactDOM from 'react-dom'
import * as jsxRuntime from 'react/jsx-runtime'
import * as zod from 'zod'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { SessionInputShell } from '@harness-input-shell'
import css from '@harness-input-css'
import '@harness-theme-base'
import '@harness-theme-tokens'

const shell = new SessionInputShell({ actx: {}, defaultSink: () => { throw new Error('unexpected submit') },
  commandAttachments: { serialize: async () => [], release: () => {}, unsupportedNotice: () => '' } })
const initial = '请帮我写一份项目计划，预算 200 元，并说明每一步的交付物。'
shell.setDraft(initial)
let mode = 'success', sends = 0, calls = 0, dictionary, disposePlugin
let panelOpen = false, lastRequest
const panelListeners = new Set<() => void>()
const setPanel = value => { panelOpen = value; panelListeners.forEach(listener => listener()) }
const entries = new Map()
const root = createRoot(document.getElementById('app')!)
const shared = { react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM,
  '@deepseek-ai/dsh-client-ui-primitives': primitives, zod }

window.__ModuleLoader__ = { load: async ({ factory }) => {
  const plugin = factory(name => { if (!(name in shared)) throw new Error(`unresolved module ${name}`); return shared[name] })
  const effects: (() => void)[] = []
  const ctx = {
    locale: { register(_ns, dict) { dictionary = dict.zh; return () => {} }, bind: () => key => dictionary[key] ?? key },
    sidebarRightTabs: { register: () => () => {} },
    sidebarRight: { mounted: { getSnapshot: () => 'fixture' }, openTab: () => setPanel(true) },
    sessions: { subagentAddress: () => undefined },
    effect: make => { effects.push(make()) },
    slots: { inject(_name, make) { effects.push(make()) },
      register(options, component) {
        entries.set(options.name, { component, injected: options.inject('fixture') })
        return () => entries.delete(options.name)
      } },
    modelDirectories: { directoryFor() { return { load: () => mode === 'catalog-hold' ? new Promise(() => {}) : Promise.resolve({
      current: { provider: 'fixture', model: 'fixture-model' }, routable: true, status: 'ready',
    }) } } },
    remote: { $mount: async () => async () => {}, promptEnhancer: {
      policy: async () => ({ ok: true, value: { timeoutMs: 1200 } }),
      lint: async () => ({ ok: true, value: { checks: ['tools', 'paths', 'mentions', 'permissions', 'deliverables'].map(category => ({
        category, state: category === 'paths' ? 'unknown' : 'ok', findings: [{ state: category === 'paths' ? 'unknown' : 'ok',
          severity: 'none', code: 'fixture', reason: category === 'paths' ? '路径服务暂未核实。' : '本地检查已完成。' }],
      })), elapsedMs: 2 } }),
      enhance(_sessionId, request, signal) {
      calls++
      lastRequest = request
      return new Promise(resolve => {
        if (mode === 'hold') return
        const timer = setTimeout(() => resolve(mode === 'failure'
          ? { ok: false, error: { code: 'prompt-enhancer/rejected', details: { reason: 'AUTH' } } }
          : { ok: true, value: { text: mode === 'format' ? '# 项目计划\n\n请在 **200 元**预算内制定项目计划。\n\n- 列出执行步骤和交付物。'
            : mode === 'loss' ? '请制定清晰的项目计划。' : `请在 200 元预算内制定项目计划。逐步列出执行步骤、预期交付物和验收标准。对于原文未明确的项目背景，请先提出必要的澄清问题。` } }), 200)
        signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
      })
    } } },
    inject(_deps, callback) { callback(ctx); return Object.assign(Promise.resolve(), {
      dispose: async () => { for (const stop of effects.reverse()) stop?.() },
    }) },
  }
  disposePlugin = await plugin.apply(ctx)
  root.render(<App />)
  window.fixture.ready = true
} }
window.fixture = {
  ready: false,
  mode(value) { mode = value },
  text() { return shell.state.getSnapshot().draft },
  setText(value) { shell.setDraft(value) },
  calls() { return calls }, sends() { return sends }, initial,
  request() { return lastRequest },
  dispose: async () => { await disposePlugin(); root.unmount(); shell.dispose() },
}
function App() {
  const open = useSyncExternalStore(listener => { panelListeners.add(listener); return () => panelListeners.delete(listener) }, () => panelOpen)
  const useInput = selector => selector(useSyncExternalStore(listener => shell.state.subscribe(listener), () => shell.state.getSnapshot()))
  const renderEntry = name => {
    const entry = entries.get(name)
    if (!entry) return null
    const Component = entry.component
    return <Component {...entry.injected} sessionId="fixture" inputActions={shell.actions}
      useInput={useInput} useSession={select => select({ removed: false })} useAccess={() => true}
      useTabInfo={() => ({ tab: { visible: true } })}
      t={(key, params = {}) => (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match)} />
  }
  return <>
    <div className="fixture-heading"><strong>增强提示词</strong><br />rc.2 原生组件验证页 · 模型响应为测试数据</div>
    <div className="fixture-layout"><main className={css.root}>
      <section className={css.card} data-composer-card>
        <div className={css.scroll}><div className={css.input} data-editor contentEditable suppressContentEditableWarning
          ref={element => { shell.editor.setRootElement(element) }} role="textbox" aria-label="聊天输入" /></div>
        <div className={css.row}>
          <div className={css.tools}>
            <button className={css.add} aria-label="添加">＋</button>
            <primitives.Button size="sm" variant="toolbar">只读</primitives.Button>
            <primitives.Button size="sm" variant="toolbar">计划</primitives.Button>
          </div>
          <div className={css.trailing}>
            <div className={css.standardControls}>
              {renderEntry('conversation.input.right')}
              <primitives.Button size="sm" variant="toolbar" aria-label="模型">模型⌄</primitives.Button>
            </div>
            <button className={css.add} aria-label="语音">◉</button>
            <button className={css.primary} aria-label="发送" onClick={() => { sends++ }}>↑</button>
          </div>
        </div>
      </section>
      {renderEntry('conversation.input.dock')}
    </main>
    {open && <aside className="fixture-panel"><button aria-label="关闭侧栏" onClick={() => setPanel(false)}>关闭侧栏</button>
      {renderEntry('sidebar.right.pane.tab')}
    </aside>}</div>
  </>
}
const plugin = document.createElement('script')
plugin.src = '/plugin.js'
document.head.append(plugin)

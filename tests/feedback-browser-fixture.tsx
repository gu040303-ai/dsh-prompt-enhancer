// Real plugin components and installed native primitives; the composer state is simulated.
import React, { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { EnhanceFeedback, EnhanceResult } from '../src/EnhanceResult.tsx'
import { resultStore } from '../src/resultStore.ts'
import { workflow } from '../src/workflow.ts'
import { compareFacts } from '../src/fidelity.ts'
import { zh, en } from '../src/locales.ts'

const id = 'feedback-preview'
const original = '帮我写一份项目计划，预算 200 元。'
const enhanced = '请在 200 元预算内制定项目计划。列出执行步骤、预期交付物和验收标准。'
let input = { draft: original, draftRev: 1, phase: 'plain', occurrences: [] }
let language: 'zh' | 'en' = 'zh'
let panel = false
const listeners = new Set<() => void>()
const notify = () => { input = { ...input }; listeners.forEach(listener => listener()) }
const useInput = selector => selector(useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => input))
const props = {
  sessionId: id, available: true, useInput,
  t: (key, params = {}) => ((language === 'zh' ? zh : en)[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match)),
  inputActions: { insertText(text, range) {
    if (input.draftRev !== range.draftRev) return false
    input = { ...input, draft: text, draftRev: input.draftRev + 1 }; notify(); return true
  } },
  openPanel() { panel = true; notify() },
} as any
workflow.register(id, { async run() { workflow.set(id, { busy: true, mode: 'quick' }) },
  cancel() { workflow.set(id, { busy: false, notice: 'cancelled' }) } })
function App() {
  useInput(value => value)
  return <>
    <main data-composer-seat="">
      <div className="composer-card">
        <div data-composer-input="" contentEditable suppressContentEditableWarning>{input.draft}</div>
        <div className="composer-toolbar"><span>＋</span><span>默认模型 <span className="send">↑</span></span></div>
      </div>
      <EnhanceFeedback {...props} />
    </main>
    {panel && <aside className="dsh-pe-panel"><EnhanceResult {...props} /></aside>}
  </>
}
const fixture = {
  show(state: string, locale: 'zh' | 'en' = 'zh') {
    language = locale; panel = false
    resultStore.clear()
    input = { ...input, draft: state === 'success' ? enhanced : original, draftRev: input.draftRev + 1 }
    workflow.set(id, { busy: false })
    if (['success', 'preview', 'review'].includes(state)) resultStore.publish({
      sessionId: id, original, enhanced, base: original, draftRev: input.draftRev,
      applied: state === 'success', elapsedMs: 1200, report: compareFacts(original, enhanced),
      ...(state === 'review' ? { reviewReason: 'facts' as const } : {}),
    })
    else if (['busy', 'busy-preview', 'busy-conditioned'].includes(state)) workflow.set(id, {
      busy: true, mode: state === 'busy-preview' ? 'preview' : state === 'busy-conditioned' ? 'conditioned' : 'quick',
    })
    else workflow.set(id, { busy: false, notice: state })
    notify()
  },
}
createRoot(document.getElementById('app')!).render(<App />)
Object.assign(window, { fixture })

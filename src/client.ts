import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { EnhanceButton, type EnhanceButtonProps, type EnhanceInjected } from './EnhanceButton.tsx'
import { EnhanceResult, EnhanceFeedback } from './EnhanceResult.tsx'
import { contribution } from './remote.ts'
import { en, zh } from './locales.ts'
import { resultStore } from './resultStore.ts'
import { untilAbort } from './cancellation.ts'
import { EnhanceLauncher } from './EnhanceLauncher.tsx'
import { EnhancePanel, type PanelInjected } from './EnhancePanel.tsx'
import { workflow } from './workflow.ts'
export { EnhanceButton, EnhanceResult, EnhanceFeedback, EnhancePanel, EnhanceLauncher, resultStore, workflow }
export const PANEL_ID = 'dsh-prompt-enhancer/panel'
export const PANEL_KIND = 'prompt-enhancer'

/** The branded session id both entries receive from their slot props. */
type SlotSessionId = EnhanceButtonProps['sessionId']

export const inject = ['remote', 'slots', 'locale', 'modelDirectories', 'sessions', 'sidebarRight', 'sidebarRightTabs']
const CSS = `
.dsh-pe-control{display:inline-flex;align-items:center;flex:none;max-width:100%}
.dsh-pe-launcher{gap:0;color:var(--dsw-alias-label-secondary)}
.dsh-pe-button,.dsh-pe-menu-button{display:inline-flex;align-items:center;justify-content:center;flex:none;padding:0!important;border-radius:8px;transition:background-color 140ms ease,color 140ms ease}
.dsh-pe-button{width:30px;height:30px}.dsh-pe-menu-button{width:18px;height:30px}
.dsh-pe-button svg{transform-origin:50% 56%;transition:transform 280ms cubic-bezier(.2,.7,.25,1),filter 240ms ease}
.dsh-pe-control .dsh-pe-button:hover:not(:disabled),.dsh-pe-control .dsh-pe-button:focus-visible:not(:disabled){color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}
.dsh-pe-control .dsh-pe-button:hover:not(:disabled) svg,.dsh-pe-control .dsh-pe-button:focus-visible:not(:disabled) svg{transform:rotate(-9deg) scale(1.14);filter:drop-shadow(0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 70%,transparent)) drop-shadow(0 0 9px color-mix(in srgb,var(--dsw-alias-state-business-primary) 40%,transparent));animation:dsh-pe-glow 2.4s ease-in-out infinite}
.dsh-pe-control .dsh-pe-button:active:not(:disabled) svg{transform:rotate(-5deg) scale(.97);transition-duration:110ms}
.dsh-pe-button[aria-busy=true]{opacity:1;color:var(--dsw-alias-state-business-primary)}
.dsh-pe-button[aria-busy=true] .dsh-pe-spinner{filter:drop-shadow(0 0 4px color-mix(in srgb,var(--dsw-alias-state-business-primary) 70%,transparent))}
.dsh-pe-spinner{display:inline-block;box-sizing:border-box;flex:none;width:13px;height:13px;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%;animation:dsh-pe-spin .8s linear infinite}
.dsh-pe-feedback{display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;width:100%;padding:6px 4px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);animation:dsh-pe-feedback-in 160ms ease-out}
.dsh-pe-feedback-label{display:inline-flex;align-items:center;gap:7px;min-width:0;overflow-wrap:anywhere}
.dsh-pe-feedback-actions{display:flex;align-items:center;gap:12px;flex:none}
.dsh-pe-feedback button,.dsh-pe-text-action{appearance:none;border:0;background:none;padding:2px 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.dsh-pe-feedback button:hover,.dsh-pe-text-action:hover{color:var(--dsw-alias-state-business-primary)}
.dsh-pe-feedback button:focus-visible,.dsh-pe-text-action:focus-visible,.dsh-pe-tabs button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px;border-radius:3px}
.dsh-pe-text-action:disabled{opacity:.45;cursor:default}
.dsh-pe-panel{height:100%;min-height:0;min-width:0;box-sizing:border-box;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.65;overflow-wrap:anywhere;animation:dsh-pe-feedback-in 160ms ease-out}
.dsh-pe-panel p{margin:0}.dsh-pe-panel-scroll{flex:1;min-height:0;overflow:auto;padding:16px;box-sizing:border-box}
.dsh-pe-result{display:flex;flex-direction:column;gap:20px;min-width:0}
.dsh-pe-result-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dsh-pe-tabs{display:inline-flex;padding:3px;gap:3px;border-radius:9px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dsh-pe-tabs button{appearance:none;border:0;border-radius:6px;background:none;padding:5px 10px;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dsh-pe-tabs button[aria-selected=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px #0000000d}
.dsh-pe-state,.dsh-pe-caption{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dsh-pe-text{white-space:pre-wrap;word-break:break-word;font:inherit;color:var(--dsw-alias-label-primary);animation:dsh-pe-ink 520ms cubic-bezier(.16,1,.3,1) backwards}
.dsh-pe-diff{display:flex;flex-direction:column;gap:12px}.dsh-pe-diff>*{animation:dsh-pe-rise 380ms cubic-bezier(.16,1,.3,1) backwards}
.dsh-pe-diff>:nth-child(2){animation-delay:28ms}.dsh-pe-diff>:nth-child(3){animation-delay:56ms}.dsh-pe-diff>:nth-child(4){animation-delay:84ms}
.dsh-pe-diff>:nth-child(5){animation-delay:112ms}.dsh-pe-diff>:nth-child(6){animation-delay:140ms}.dsh-pe-diff>:nth-child(7){animation-delay:168ms}
.dsh-pe-diff>:nth-child(8){animation-delay:196ms}
.dsh-pe-choice{display:flex;gap:10px;align-items:flex-start;padding:8px 0;min-width:0}
.dsh-pe-choice input{flex:none;margin:5px 0 0;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer}
.dsh-pe-choice-text{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}
.dsh-pe-before,.dsh-pe-after{display:flex;gap:8px;align-items:flex-start;padding:5px 8px;border-radius:6px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}
.dsh-pe-before{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.dsh-pe-after{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 9%,transparent)}
.dsh-pe-before del{color:var(--dsw-alias-label-secondary);text-decoration-thickness:1px}.dsh-pe-after ins{text-decoration:none}
.dsh-pe-change-sign{flex:none;font-family:ui-monospace,monospace;color:var(--dsw-alias-label-secondary)}
.dsh-pe-choice-same{white-space:pre-wrap;color:var(--dsw-alias-label-secondary)}
.dsh-pe-warning{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent);font-size:12px}
.dsh-pe-notice{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-pe-details{font-size:12px;color:var(--dsw-alias-label-secondary)}.dsh-pe-details summary{cursor:pointer}.dsh-pe-details p{margin-top:6px}
.dsh-pe-checks{border-top:1px solid var(--dsw-alias-border-l1);margin-top:24px;padding-top:16px;font-size:12px}
.dsh-pe-checks>summary{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;list-style:none;color:var(--dsw-alias-label-secondary)}
.dsh-pe-checks>summary::-webkit-details-marker{display:none}.dsh-pe-checks>summary>span:first-child:before{content:'›';display:inline-block;width:14px;transition:transform 120ms ease}
.dsh-pe-checks[open]>summary>span:first-child:before{transform:rotate(90deg)}
.dsh-pe-check-list{display:flex;flex-direction:column;gap:16px;padding-top:16px}.dsh-pe-check-label{display:flex;align-items:center;gap:8px}
.dsh-pe-check-label strong{font-weight:500}.dsh-pe-check-label>.dsh-pe-caption{margin-left:auto}
.dsh-pe-check p{padding:5px 0 0 20px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.dsh-pe-footer{flex:none;display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dsh-pe-footer>.dsh-pe-text-action{margin-left:auto}.dsh-pe-panel-start{padding:14px 0;display:flex;flex-direction:column;gap:16px;align-items:flex-start}
.dsh-pe-panel-start p{color:var(--dsw-alias-label-secondary);font-size:13px}.dsh-pe-empty{display:flex;gap:8px;align-items:center;color:var(--dsw-alias-label-secondary);padding:14px 0}
.dsh-pe-flash{animation:dsh-pe-flash 640ms ease-out,dsh-pe-ink-soft 500ms ease!important;border-radius:6px}
@keyframes dsh-pe-feedback-in{from{opacity:.65}to{opacity:1}}
@keyframes dsh-pe-spin{to{transform:rotate(360deg)}}
@keyframes dsh-pe-appear{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes dsh-pe-flash{from{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}to{background:transparent}}
@keyframes dsh-pe-ink{from{opacity:0;filter:blur(6px);transform:translateY(7px)}to{opacity:1;filter:blur(0);transform:none}}
@keyframes dsh-pe-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes dsh-pe-ink-soft{from{opacity:.35;filter:blur(2px)}to{opacity:1;filter:blur(0)}}
@keyframes dsh-pe-glow{0%,100%{filter:drop-shadow(0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 70%,transparent)) drop-shadow(0 0 8px color-mix(in srgb,var(--dsw-alias-state-business-primary) 34%,transparent)) drop-shadow(0 0 16px color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent))}50%{filter:drop-shadow(0 0 3px color-mix(in srgb,var(--dsw-alias-state-business-primary) 95%,transparent)) drop-shadow(0 0 12px color-mix(in srgb,var(--dsw-alias-state-business-primary) 62%,transparent)) drop-shadow(0 0 24px color-mix(in srgb,var(--dsw-alias-state-business-primary) 34%,transparent))}}
@media(prefers-reduced-motion:reduce){.dsh-pe-panel,.dsh-pe-feedback,.dsh-pe-spinner,.dsh-pe-flash,.dsh-pe-text,.dsh-pe-diff>*,.dsh-pe-button,.dsh-pe-button svg{animation:none!important}.dsh-pe-button,.dsh-pe-menu-button,.dsh-pe-button svg,.dsh-pe-checks>summary>span:first-child:before{transition:none!important}}
`

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('promptEnhancer', { zh, en }))
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-prompt-enhancer'
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  })
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort(); workflow.clear(); resultStore.clear() })
  /**
   * Both entries call the same facade: the rewrite is one host capability, and
   * the result strip retries it with exactly the arguments the button used.
   */
  const injectEnhancer = (sessionId: SlotSessionId): PanelInjected => ({
    available: ctx.sessions.subagentAddress(sessionId) === undefined,
    openPanel: (view = 'result') => {
      if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) return
      workflow.openView(sessionId, view)
      ctx.sidebarRight.openTab(PANEL_KIND)
    },
    enhance: async (text, signal, lint) => {
      const policySignal = AbortSignal.any([signal, lifetime.signal])
      policySignal.throwIfAborted()
      const policy = await untilAbort(ctx.remote.promptEnhancer.policy(sessionId, policySignal), policySignal)
      if (!policy.ok) throw policy.error
      policySignal.throwIfAborted()
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(Object.assign(new Error('Enhancement timed out'),
        { details: { reason: 'timeout' } })), policy.value.timeoutMs)
      const combined = AbortSignal.any([signal, lifetime.signal, timeout.signal])
      try {
        combined.throwIfAborted()
        const directory = ctx.modelDirectories.directoryFor(sessionId)
        const current = await untilAbort(directory.load(), combined)
        combined.throwIfAborted()
        if (!current.current || !current.routable || current.status === 'selecting') {
          throw new Error('model is unavailable or being selected')
        }
        const result = await untilAbort(ctx.remote.promptEnhancer.enhance(sessionId,
          { text, selection: current.current, ...(lint === undefined ? {} : { lint }) }, combined), combined)
        combined.throwIfAborted()
        if (!result.ok) throw result.error
        return result.value
      } finally {
        clearTimeout(timer)
      }
    },
    lint: async (text, signal) => {
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(new Error('Preflight carrier timed out')), 1800)
      const combined = AbortSignal.any([signal, lifetime.signal, timeout.signal])
      try {
        combined.throwIfAborted()
        const result = await untilAbort(ctx.remote.promptEnhancer.lint(sessionId, { text }, combined), combined)
        combined.throwIfAborted()
        if (!result.ok) throw result.error
        return result.value
      } finally { clearTimeout(timer) }
    },
  })
  const t = ctx.locale.bind('promptEnhancer')
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: PANEL_ID, kind: PANEL_KIND, title: () => t('panelTitle'),
    guide: [{ id: PANEL_ID, order: 70, title: () => t('panelTitle'), description: () => t('panelHint') }] }))
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: 'prompt-enhancer', locale: 'promptEnhancer',
    inject: injectEnhancer,
  }, EnhanceLauncher))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'prompt-enhancer-feedback', locale: 'promptEnhancer',
    inject: injectEnhancer,
  }, EnhanceFeedback))
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: PANEL_ID, locale: 'promptEnhancer',
    inject: injectEnhancer,
  }, EnhancePanel))
}

/** Mount the private Remote namespace and withdraw UI before its RPC contribution. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.promptEnhancer', 'slots', 'locale', 'modelDirectories', 'sessions', 'sidebarRight', 'sidebarRightTabs'], registerUi)
  try { await ui } catch (error) { await ui.dispose(); await disposeRemote(); throw error }
  return async () => { await ui.dispose(); await disposeRemote() }
}



import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { EnhanceResponse } from './remote.ts'
import { ENDPOINT, POLICY_ENDPOINT, LINT_ENDPOINT } from './remote.ts'
import { compareFacts } from './fidelity.ts'
import { failureKey } from './failure.ts'
import { resultStore } from './resultStore.ts'
import { workflow, type RewriteMode } from './workflow.ts'
import { plainPrompt } from './plainText.ts'
import { untilAbort } from './cancellation.ts'
import type { LintReport } from './lintTypes.ts'

export interface EnhanceInjected {
  available: boolean
  enhance(text: string, signal: AbortSignal, lint?: LintReport): Promise<EnhanceResponse>
  lint(text: string, signal: AbortSignal): Promise<LintReport>
  openPanel(view?: 'result' | 'checks'): void
}
export type EnhanceButtonProps = Pick<PropsRuntime<'conversation.input.right'>,
  'sessionId' | 'inputActions' | 'useInput' | 'useSession' | 'useAccess'>
  & PropsLocale<'promptEnhancer'> & InjectFace<EnhanceInjected>

export function useActivity(sessionId: string) {
  return useSyncExternalStore(workflow.subscribe, () => workflow.state(sessionId))
}

/** Lives with the composer. Opening or closing the optional sidebar cannot own a quick request. */
export function useEnhancementController(props: EnhanceButtonProps) {
  const input = props.useInput(value => value), session = props.useSession(value => value)
  const allowed = props.useAccess(ENDPOINT), policy = props.useAccess(POLICY_ENDPOINT), lintAllowed = props.useAccess(LINT_ENDPOINT)
  const blocked: keyof typeof import('./locales.ts').zh | undefined = !props.available || session.removed ? 'unavailable' : !allowed || !policy ? 'forbidden'
    : input.phase !== 'plain' ? 'command' : input.occurrences.length ? 'references' : !input.draft.trim() ? 'empty' : undefined
  const latest = useRef({ props, input, blocked, lintAllowed })
  useLayoutEffect(() => { latest.current = { props, input, blocked, lintAllowed } })
  const flight = useRef<{ controller: AbortController; mode: RewriteMode; rev: number } | null>(null)
  const generation = useRef(0)
  const { sessionId } = props
  useLayoutEffect(() => {
    const job = flight.current
    if (job && (input.draftRev !== job.rev || input.phase !== 'plain' || input.occurrences.length || session.removed || !allowed || !policy)) {
      job.controller.abort()
      flight.current = null; generation.current++
      workflow.set(sessionId, { busy: false, notice: 'changed' })
    }
  }, [sessionId, input.draftRev, input.phase, input.occurrences, session.removed, allowed, policy])

  useEffect(() => {
    const owner = {
      cancel(previewOnly = false) {
        if (flight.current && (!previewOnly || flight.current.mode === 'preview')) {
          flight.current.controller.abort()
          flight.current = null; generation.current++
          workflow.set(sessionId, { busy: false, notice: 'cancelled' })
        }
      },
      async run(mode: RewriteMode, previousOriginal?: string): Promise<void> {
        const captured = latest.current
        if (flight.current || captured.blocked || mode === 'conditioned' && !captured.lintAllowed) return
        const base = captured.input.draft, rev = captured.input.draftRev, original = previousOriginal ?? base
        const controller = new AbortController(), job = { controller, mode, rev }
        flight.current = job
        const current = ++generation.current, started = Date.now()
        workflow.set(sessionId, { busy: true, mode })
        let notice: string | undefined
        try {
          const report = mode === 'conditioned' ? await untilAbort(captured.props.lint(original, controller.signal), controller.signal) : undefined
          controller.signal.throwIfAborted()
          const response = await untilAbort(captured.props.enhance(original, controller.signal, report), controller.signal)
          if (generation.current !== current || controller.signal.aborted) return
          const text = plainPrompt(response.text, original)
          if (!text.trim()) throw { details: { reason: 'empty-output' } }
          if (latest.current.input.draftRev !== rev || latest.current.input.draft !== base || latest.current.input.phase !== 'plain') {
            notice = 'changed'; return
          }
          if (text === base) { notice = 'unchanged'; return }
          const facts = compareFacts(original, text)
          const preview = mode === 'preview' || facts.lost.length > 0
          const outcome = { sessionId, original, base, enhanced: text, draftRev: rev,
            applied: !preview, elapsedMs: Date.now() - started, report: facts, sourceMode: mode,
            ...(facts.lost.length ? { reviewReason: 'facts' as const } : {}) }
          if (preview) {
            resultStore.publish(outcome)
            captured.props.openPanel()
          } else if (captured.props.inputActions.insertText(text, { start: 0, end: base.length, draftRev: rev })) {
            resultStore.publish({ ...outcome, draftRev: rev + 1 })
          } else notice = 'changed'
        } catch (error) {
          if (generation.current !== current) return
          notice = controller.signal.aborted ? workflow.state(sessionId).notice ?? 'cancelled' : failureKey(error, false)
        } finally {
          if (generation.current === current) {
            if (flight.current === job) flight.current = null
            workflow.set(sessionId, { busy: false, ...(notice ? { notice } : {}) })
          }
        }
      },
    }
    const unregister = workflow.register(sessionId, owner)
    return () => { generation.current++; unregister(); flight.current = null }
  }, [sessionId])
  return { blocked, activity: useActivity(sessionId) }
}

/** The advanced panel starts a preview; the launcher is the only request owner. */
export function EnhanceButton({ sessionId, t, ...props }: EnhanceButtonProps) {
  const activity = useActivity(sessionId)
  const input = props.useInput(value => value)
  const blocked = activity.busy || !props.available || input.phase !== 'plain' || !input.draft.trim() || input.occurrences.length > 0
  return <div className="dsh-pe-panel-start">
    <p>{t('panelHint')}</p>
    <Button variant="primary" size="sm" disabled={blocked} onClick={() => { void workflow.run(sessionId, 'preview') }}>{t('previewOptimize')}</Button>
  </div>
}

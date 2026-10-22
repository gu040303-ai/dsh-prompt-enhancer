import { useEffect, useState, useSyncExternalStore } from 'react'
import type { EnhanceButtonProps, EnhanceInjected } from './EnhanceButton.tsx'
import { EnhanceResult } from './EnhanceResult.tsx'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { LINT_ENDPOINT } from './remote.ts'
import { workflow } from './workflow.ts'
import { LINT_CATEGORIES, unknownCheck, type LintReport } from './lintTypes.ts'

export interface PanelInjected extends EnhanceInjected {}
export type EnhancePanelProps = EnhanceButtonProps & Pick<PropsRuntime<'sidebar.right.pane.tab'>, 'useTabInfo'>

export function EnhancePanel(props: EnhancePanelProps) {
  const { sessionId, useInput, useAccess, useTabInfo, available, lint, t } = props
  const input = useInput(value => value), allowed = useAccess(LINT_ENDPOINT), visible = useTabInfo().tab.visible
  const intent = useSyncExternalStore(workflow.subscribe, () => workflow.panelView(sessionId))
  const [expanded, setExpanded] = useState(intent === 'checks')
  const [snapshot, setSnapshot] = useState<{ text: string; rev: number; report: LintReport } | null>(null)
  const [busy, setBusy] = useState(false)
  const valid = snapshot !== null && snapshot.text === input.draft && snapshot.rev === input.draftRev
  useEffect(() => { setExpanded(intent === 'checks') }, [intent])
  useEffect(() => {
    if (!visible) workflow.cancel(sessionId, true)
    return () => workflow.cancel(sessionId, true)
  }, [sessionId, visible])
  useEffect(() => {
    const controller = new AbortController()
    setBusy(false)
    if (!visible || !available || !allowed || input.phase !== 'plain' || input.occurrences.length || !input.draft.trim()) return () => controller.abort()
    setBusy(true)
    const { draft: text, draftRev: rev } = input
    const timer = setTimeout(() => {
      void lint(text, controller.signal).then(report => {
        if (!controller.signal.aborted) setSnapshot({ text, rev, report })
      }).catch(() => {
        if (!controller.signal.aborted) setSnapshot({ text, rev,
          report: { checks: LINT_CATEGORIES.map(category => unknownCheck(category)), elapsedMs: 0 } })
      }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [sessionId, input.draft, input.draftRev, input.phase, input.occurrences, visible, available, allowed, lint])
  const report = valid ? snapshot.report : undefined
  const warnings = report?.checks.filter(item => item.state === 'warn').length ?? 0
  const unknowns = report?.checks.filter(item => item.state === 'unknown').length ?? 0
  const summary = busy ? t('checking') : !report ? t('notChecked') : warnings || unknowns
    ? t('checkSummary', { warnings, unknowns }) : t('checksClear')
  const checks = <details className="dsh-pe-checks" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary><span>{t('preflight')}</span><span className="dsh-pe-caption">{summary}</span></summary>
    <div className="dsh-pe-check-list">
      {!report && <p>{allowed ? t('empty') : t('forbidden')}</p>}
      {report?.checks.map(item => <div className={`dsh-pe-check dsh-pe-check-${item.state}`} key={item.category}>
        <div className="dsh-pe-check-label"><span aria-hidden="true">{item.state === 'warn' ? '!' : item.state === 'unknown' ? '–' : '✓'}</span>
          <strong>{t(item.category)}</strong><span className="dsh-pe-caption">{t(item.state === 'unknown' ? 'unverified' : item.state === 'warn' ? 'attention' : 'checked')}</span></div>
        {item.findings.map((finding, n) => <p key={n}>{finding.token && <span>{finding.token}： </span>}{finding.reason}
          {finding.suggestion ? ` ${t('suggestion', { name: finding.suggestion })}` : ''}</p>)}
      </div>)}
    </div>
  </details>
  return <section className="dsh-pe-panel" aria-label={t('panelTitle')}><EnhanceResult {...props} details={checks} /></section>
}

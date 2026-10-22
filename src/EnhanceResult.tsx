import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { appendFacts, compareFacts } from './fidelity.ts'
import { resultStore, type EnhanceOutcome } from './resultStore.ts'
import { sentenceReview, assembleReview } from './selection.ts'
import { plainPrompt } from './plainText.ts'
import { workflow, matchesOutcome } from './workflow.ts'
import { EnhanceButton, useActivity, type EnhanceButtonProps } from './EnhanceButton.tsx'

export type EnhanceResultProps = EnhanceButtonProps & { details?: ReactNode }
const useOutcome = (id: string) => useSyncExternalStore(resultStore.subscribe, () => resultStore.snapshot(id))
const displaySentence = (text: string) => text.replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, '')

function writeOutcome(props: EnhanceButtonProps, text: string, outcome: EnhanceOutcome): boolean {
  // The actual editor performs the final compare-and-swap, even before React catches up.
  return props.inputActions.insertText(text, { start: 0, end: outcome.applied === false
    ? (outcome.base ?? outcome.original).length : outcome.enhanced.length, draftRev: outcome.draftRev! })
}

/** One quiet line below the native input, in both welcome and ordinary layouts. */
export function EnhanceFeedback(props: EnhanceButtonProps) {
  const { sessionId, t } = props, outcome = useOutcome(sessionId), activity = useActivity(sessionId)
  const input = props.useInput(value => value), root = useRef<HTMLDivElement>(null)
  const valid = outcome !== undefined && input.phase === 'plain' && matchesOutcome(outcome, input.draft, input.draftRev)
  useEffect(() => {
    if (outcome && input.phase === 'plain' && !input.draft.trim()) resultStore.dismiss(sessionId)
  }, [outcome, input.draft, input.phase, sessionId])
  useEffect(() => {
    if (outcome?.applied === false || !outcome) return
    const editor = root.current?.closest('[data-composer-seat], .fixture-layout')?.querySelector('[data-composer-input], [data-editor]')
    editor?.classList.add('dsh-pe-flash')
    const timer = setTimeout(() => editor?.classList.remove('dsh-pe-flash'), 650)
    return () => { clearTimeout(timer); editor?.classList.remove('dsh-pe-flash') }
  }, [outcome])
  if (!activity.busy && !activity.notice && !valid) return null
  return <div ref={root} className="dsh-pe-feedback" aria-live="polite" role="status">
    <span className="dsh-pe-feedback-label">
      {activity.busy && <span className="dsh-pe-spinner" aria-hidden="true" />}
      {!activity.busy && valid && !activity.notice && <span aria-hidden="true">{outcome.applied === false ? '◌' : '✓'}</span>}
      <span>{activity.busy ? t('loading') : activity.notice ? t(activity.notice as keyof typeof import('./locales.ts').zh)
        : outcome?.reviewReason === 'facts' ? t('needsReview') : outcome?.applied === false ? t('previewReady') : t('resultOk')}</span>
    </span>
    <span className="dsh-pe-feedback-actions">
      {activity.busy ? <button type="button" onClick={() => workflow.cancel(sessionId)}>{t('cancel')}</button> : <>
        {valid && outcome.applied !== false && <button type="button" onClick={() => {
          if (writeOutcome(props, outcome.original, outcome)) resultStore.dismiss(sessionId)
        }}>{t('actionUndo')}</button>}
        {valid && <button type="button" onClick={() => props.openPanel()}>{t('viewChanges')}</button>}
        {activity.notice && !['changed', 'cancelled', 'unchanged'].includes(activity.notice) && <button type="button"
          onClick={() => { void workflow.run(sessionId, 'quick') }}>{t('actionRetry')}</button>}
        {activity.notice && <button type="button" aria-label={t('actionDismiss')}
          onClick={() => workflow.set(sessionId, { busy: false })}>×</button>}
      </>}
    </span>
  </div>
}

export function EnhanceResult(props: EnhanceResultProps) {
  const { sessionId, t, details } = props, outcome = useOutcome(sessionId), activity = useActivity(sessionId)
  const input = props.useInput(value => value)
  const [view, setView] = useState<'result' | 'diff'>('result')
  const [selection, setSelection] = useState<ReadonlySet<number> | null>(null)
  useEffect(() => { setView('result'); setSelection(null) }, [outcome])
  useEffect(() => {
    if (outcome && input.phase === 'plain' && !input.draft.trim()) resultStore.dismiss(sessionId)
  }, [outcome, sessionId, input.draft, input.phase])
  const review = useMemo(() => outcome ? sentenceReview(outcome.original, outcome.enhanced) : null, [outcome])
  const preview = outcome?.applied === false
  const valid = outcome !== undefined && input.phase === 'plain' && matchesOutcome(outcome, input.draft, input.draftRev)
  const selected = selection ?? new Set(review?.choices.filter(item => !item.same).map(item => item.id))
  const candidate = outcome ? plainPrompt(preview && review && !review.truncated
    ? assembleReview(review, selected) : outcome.enhanced, outcome.original) : ''
  const facts = useMemo(() => outcome ? compareFacts(outcome.original, candidate) : null, [outcome, candidate])
  const blocked = !valid || activity.busy
  const undo = () => {
    if (outcome && !blocked && writeOutcome(props, outcome.original, outcome)) resultStore.dismiss(sessionId)
  }
  const apply = () => {
    if (!outcome || blocked) return
    if (candidate === input.draft) { resultStore.dismiss(sessionId); return }
    if (!writeOutcome(props, candidate, outcome)) return
    resultStore.publish({ ...outcome, enhanced: candidate, applied: true, draftRev: input.draftRev + 1,
      reviewReason: undefined, report: compareFacts(outcome.original, candidate) })
  }
  const restore = () => {
    if (!outcome || blocked || !facts?.lost.length) return
    const text = appendFacts(candidate, facts.lost, t('restoreHeader'))
    if (!preview && !writeOutcome(props, text, outcome)) return
    resultStore.publish({ ...outcome, enhanced: text, reviewReason: undefined,
      draftRev: preview ? input.draftRev : input.draftRev + 1, report: compareFacts(outcome.original, text) })
  }
  return <>
    <div className="dsh-pe-panel-scroll">
      {outcome ? <div className="dsh-pe-result">
        <div className="dsh-pe-result-heading">
          <div role="tablist" aria-label={t('resultViews')} className="dsh-pe-tabs">
            <button type="button" role="tab" aria-selected={view === 'result'} onClick={() => setView('result')}>{t('resultTab')}</button>
            <button type="button" role="tab" aria-selected={view === 'diff'} onClick={() => setView('diff')}>{t('diffTab')}</button>
          </div>
          <span className="dsh-pe-state">{preview ? t('previewReady') : t('applied')}</span>
        </div>
        {!valid && <p className="dsh-pe-notice" role="status">{t('stale')}</p>}
        {!!facts?.lost.length && <div className="dsh-pe-warning" role="status">
          <p>{t('detailWarning', { count: facts.lost.length })}</p>
          <button type="button" className="dsh-pe-text-action" disabled={blocked} onClick={restore}>{t('actionRestore')}</button>
        </div>}
        <div role="tabpanel" aria-label={t(view === 'result' ? 'resultTab' : 'diffTab')}>
          {view === 'result' ? <div className="dsh-pe-text" key={outcome.seq}>{candidate}</div> : <div className="dsh-pe-diff">
            {preview && <p className="dsh-pe-caption">{t('previewHint')}</p>}
            {review?.truncated ? <p>{t('diffTooLong')}</p> : review?.choices.map(item => item.same
              ? <p key={item.id} className="dsh-pe-choice-same">{displaySentence(item.before)}</p>
              : <div key={item.id} className="dsh-pe-choice">
                {preview && <input type="checkbox" aria-label={t('chooseSentence', { index: item.id + 1 })}
                  disabled={blocked} checked={selected.has(item.id)} onChange={event => {
                    const next = new Set(selected)
                    if (event.target.checked) next.add(item.id); else next.delete(item.id)
                    setSelection(next)
                  }} />}
                <div className="dsh-pe-choice-text">
                  {item.before.trim() && <div className="dsh-pe-before"><span className="dsh-pe-change-sign" aria-hidden="true">−</span><del>{displaySentence(item.before)}</del></div>}
                  {item.after.trim() && <div className="dsh-pe-after"><span className="dsh-pe-change-sign" aria-hidden="true">+</span><ins>{displaySentence(item.after)}</ins></div>}
                </div>
              </div>)}
          </div>}
        </div>
        <details className="dsh-pe-details"><summary>{t('details')}</summary>
          <p>{t('resultTime', { ms: Math.round(outcome.elapsedMs) })}</p>
          {facts && <p>{t('resultFacts', { kept: facts.kept.length, total: facts.facts.length })}</p>}
        </details>
      </div> : activity.busy ? <div className="dsh-pe-empty" role="status"><span className="dsh-pe-spinner" />{t('loading')}</div>
        : <EnhanceButton {...props} />}
      {details}
    </div>
    {outcome && <footer className="dsh-pe-footer">
      {preview ? <><Button variant="primary" size="sm" disabled={blocked} onClick={apply}>{t('applySelection')}</Button>
        <Button variant="ghost" size="sm" onClick={() => { workflow.cancel(sessionId, true); resultStore.dismiss(sessionId) }}>{t('cancel')}</Button></>
        : <Button variant="ghost" size="sm" disabled={blocked} onClick={undo}>{t('restoreOriginal')}</Button>}
      <button type="button" className="dsh-pe-text-action" disabled={blocked}
        onClick={() => { void workflow.run(sessionId, 'preview', outcome.original) }}>{t('actionRetry')}</button>
    </footer>}
  </>
}

import type { FidelityReport } from './fidelity.ts'

/** One applied enhancement, kept until the user dismisses it or the draft moves on. */
export interface EnhanceOutcome {
  sessionId: string
  /** The draft before the rewrite, used to undo and to retry. */
  original: string
  /** The text actually written back into the editor. */
  enhanced: string
  /** Preview does not modify the editor until the user applies all selected sentences. */
  applied?: boolean
  base?: string
  draftRev?: number
  elapsedMs: number
  report: FidelityReport
  sourceMode?: 'quick' | 'preview' | 'conditioned'
  reviewReason?: 'facts'
}

const outcomes = new Map<string, EnhanceOutcome>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Session-keyed result channel shared by the composer button and the strip.
 * A module singleton is enough: both entries are loaded from this one bundle,
 * and every reader re-subscribes through `useSyncExternalStore`.
 */
export const resultStore = {
  publish(outcome: EnhanceOutcome): void {
    outcomes.set(outcome.sessionId, outcome)
    notify()
  },
  dismiss(sessionId: string): void {
    if (outcomes.delete(sessionId)) notify()
  },
  /** @returns the stored outcome, stable by identity until it is replaced. */
  snapshot(sessionId: string): EnhanceOutcome | undefined {
    return outcomes.get(sessionId)
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  /** Drop every session's outcome; called when the plugin is disposed. */
  clear(): void {
    if (outcomes.size === 0) return
    outcomes.clear()
    notify()
  },
}

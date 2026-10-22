import type { EnhanceOutcome } from './resultStore.ts'

export type RewriteMode = 'quick' | 'preview' | 'conditioned'
export interface Activity { busy: boolean; mode?: RewriteMode; notice?: string; cancelled?: boolean }
const idle: Activity = { busy: false }
const activities = new Map<string, Activity>()
const listeners = new Set<() => void>()
const commands = new Map<string, { run(mode: RewriteMode, original?: string): Promise<void>; cancel(previewOnly?: boolean): void }>()
const panelViews = new Map<string, 'result' | 'checks'>()
const notify = () => listeners.forEach(listener => listener())

/** One request owner per composer, independent from the optional sidebar. */
export const workflow = {
  state: (id: string): Activity => activities.get(id) ?? idle,
  set(id: string, value: Activity): void { activities.set(id, value); notify() },
  subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } },
  register(id: string, command: NonNullable<ReturnType<typeof commands.get>>): () => void {
    commands.set(id, command)
    return () => { if (commands.get(id) === command) { command.cancel(); commands.delete(id); activities.delete(id); notify() } }
  },
  run(id: string, mode: RewriteMode, original?: string): Promise<void> { return commands.get(id)?.run(mode, original) ?? Promise.resolve() },
  cancel(id: string, previewOnly = false): void { commands.get(id)?.cancel(previewOnly) },
  panelView: (id: string): 'result' | 'checks' => panelViews.get(id) ?? 'result',
  openView(id: string, view: 'result' | 'checks'): void { panelViews.set(id, view); notify() },
  clear(): void { for (const command of commands.values()) command.cancel(); commands.clear(); activities.clear(); panelViews.clear(); notify() },
}

export function matchesOutcome(outcome: EnhanceOutcome, draft: string, rev: number): boolean {
  return draft === (outcome.applied === false ? outcome.base ?? outcome.original : outcome.enhanced)
    && (outcome.draftRev === undefined || rev === outcome.draftRev)
}

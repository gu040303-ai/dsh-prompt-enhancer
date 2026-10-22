import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { appendPluginRecord, type Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type { AuditRequest, Limits } from './enhance.ts'
import { enhanceDraft, EnhancementError } from './enhance.ts'
import { descriptor, policyDescriptor, lintDescriptor, PACKAGE, type EnhanceRequest, type EnhanceResponse, type EnhancePolicy, type LintRequest } from './remote.ts'
import { lintDraft } from './lint.ts'
import type { LintReport } from './lintTypes.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { promptEnhancerController: PromptEnhancerController }
}
declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap { 'plugin:prompt-enhancer/request': AuditRequest }
}

/** Cordis owns the service, descriptor, in-flight cancellation and hot disposal. */
export default class PromptEnhancerController extends TypertRemoteService {
  static inject = ['llm', 'typert', 'sessions']
  static Config: z<Limits> = z.object({
    timeoutMs: z.number().step(1).min(1000).max(2147483647).required(),
    maxInputBytes: z.number().step(1).min(1).max(65536).required(),
    maxOutputTokens: z.number().step(1).min(1).max(32768).required(),
    maxConcurrentRequests: z.number().step(1).min(1).max(32).required(),
  })
  private readonly lifetime = new AbortController()
  private readonly active = new Set<string>()
  private readonly limits: Limits

  constructor(ctx: Context, config: Limits) {
    super(ctx, 'promptEnhancerController', { namespace: 'promptEnhancer' })
    this.limits = PromptEnhancerController.Config(config)
    ctx.effect(() => ctx.typert.register({
      package: PACKAGE, face: 'host', schemas: [],
      model: { services: [], events: [], objects: [] }, invocations: [descriptor, policyDescriptor, lintDescriptor],
    }))
    ctx.effect(() => () => { this.lifetime.abort(new EnhancementError('unloaded')) })
  }

  /**
   * @param session - lookup carrying the caller's Session-resource authorization.
   * @param signal - cancellation from the Remote carrier.
   * @returns public execution limits, without provider configuration or credentials.
   */
  @Remote
  policy(session: Session, signal: AbortSignal): EnhancePolicy {
    void session
    signal.throwIfAborted()
    return { timeoutMs: this.limits.timeoutMs }
  }

  /** Read-only local preflight, bound to the same authenticated Session lookup. */
  @Remote
  async lint(session: Session, request: LintRequest, signal: AbortSignal): Promise<LintReport> {
    if (Buffer.byteLength(request.text, 'utf8') > this.limits.maxInputBytes) {
      throw new RemoteError('prompt-enhancer/rejected', '输入超过长度限制，未执行预检。', { reason: 'input-too-long' })
    }
    return lintDraft(this.ctx, session, request.text, AbortSignal.any([signal, this.lifetime.signal]))
  }

  /**
   * @param session - Gateway-resolved Session; lookup also supplies resource authorization.
   * @param request - unsent draft and the model currently selected in the host UI.
   * @param signal - cancellation supplied by Harness's authenticated RPC carrier.
   * @returns a complete replacement draft; this method never submits it.
   */
  @Remote
  async enhance(session: Session, request: EnhanceRequest, signal: AbortSignal): Promise<EnhanceResponse> {
    if (this.active.has(session.id) || this.active.size >= this.limits.maxConcurrentRequests) {
      throw new RemoteError('prompt-enhancer/rejected', '已有提示词优化请求正在处理，请稍后重试。', { reason: 'busy' })
    }
    this.active.add(session.id)
    const timerAbort = new AbortController()
    const timer = setTimeout(() => timerAbort.abort(new EnhancementError('timeout')), this.limits.timeoutMs)
    const combined = AbortSignal.any([signal, this.lifetime.signal, timerAbort.signal])
    try {
      // A browser-supplied report is an opt-in signal, never a source of Host facts.
      // Recheck this exact draft and Session before letting findings reach a model.
      const verified = request.lint === undefined ? request : { ...request, lint: await this.lint(session, { text: request.text }, combined) }
      return await enhanceDraft(this.ctx.llm, verified, this.limits, session.id, combined,
        entry => { appendPluginRecord(session, 'plugin:prompt-enhancer/request', entry) })
    } catch (error) {
      const reason = combined.aborted
        ? timerAbort.signal.aborted ? 'timeout' : 'cancelled'
        : error instanceof EnhancementError ? error.reason : 'model-unavailable'
      // Never return arbitrary provider error bodies, which may contain credentials.
      throw new RemoteError('prompt-enhancer/rejected', '提示词优化失败，原始输入已保留。', { reason })
    } finally {
      clearTimeout(timer)
      this.active.delete(session.id)
    }
  }
}

import { z } from 'zod'
import type { InvocationDescriptor, RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { LintReport } from './lintTypes.ts'

export const PACKAGE = 'dsh-prompt-enhancer'
export const ENDPOINT = 'promptEnhancer/enhance' as const
export const POLICY_ENDPOINT = 'promptEnhancer/policy' as const
export const LINT_ENDPOINT = 'promptEnhancer/lint' as const
export const lintReportSchema = z.strictObject({
  checks: z.array(z.strictObject({
    category: z.enum(['tools', 'paths', 'mentions', 'permissions', 'deliverables']),
    state: z.enum(['ok', 'warn', 'unknown']),
    findings: z.array(z.strictObject({ state: z.enum(['ok', 'warn', 'unknown']), severity: z.enum(['none', 'info', 'warning']),
      code: z.string().max(80), reason: z.string().max(512), token: z.string().max(1024).optional(), suggestion: z.string().max(128).optional() })).min(1).max(32),
  })).length(5).refine(checks => new Set(checks.map(item => item.category)).size === 5),
  elapsedMs: z.number().nonnegative(),
})
export const lintRequestSchema = z.strictObject({ text: z.string().min(1).max(65536) })
export type LintRequest = z.infer<typeof lintRequestSchema>

export const requestSchema = z.strictObject({
  text: z.string().min(1).max(65536),
  lint: lintReportSchema.optional(),
  selection: z.strictObject({
    provider: z.string().min(1).max(512),
    model: z.string().min(1).max(512),
    reasoningEffort: z.string().min(1).max(512).optional(),
  }),
})
export const responseSchema = z.strictObject({ text: z.string().min(1).max(262144) })
export type EnhanceRequest = z.infer<typeof requestSchema>
export type EnhanceResponse = z.infer<typeof responseSchema>
export const policySchema = z.strictObject({ timeoutMs: z.number().int().min(1000).max(2147483647) })
export type EnhancePolicy = z.infer<typeof policySchema>

// Explicit runtime contributions are supported by rc.2's Typert registry.
// Both halves share these strict codecs; there is no source-mode fallback.
export const descriptor: InvocationDescriptor = {
  id: `${PACKAGE}#${ENDPOINT}`,
  service: 'promptEnhancerController', namespace: 'promptEnhancer', method: 'enhance',
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'session', wire: 'sessionId', source: 'lookup', lookup: 'session',
      codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => z.string().min(1) } },
    { name: 'request', wire: 'request', source: 'json',
      codec: { mode: 'strict', typeSymbol: `${PACKAGE}#EnhanceRequest`, create: () => requestSchema } },
  ],
  cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: `${PACKAGE}#EnhanceResponse`, create: () => responseSchema },
}
export const policyDescriptor: InvocationDescriptor = {
  id: `${PACKAGE}#${POLICY_ENDPOINT}`, service: 'promptEnhancerController', namespace: 'promptEnhancer', method: 'policy',
  invocation: { kind: 'direct' }, parameters: [descriptor.parameters[0]],
  cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: `${PACKAGE}#EnhancePolicy`, create: () => policySchema },
}
export const lintDescriptor: InvocationDescriptor = {
  id: `${PACKAGE}#${LINT_ENDPOINT}`, service: 'promptEnhancerController', namespace: 'promptEnhancer', method: 'lint',
  invocation: { kind: 'direct' }, parameters: [descriptor.parameters[0], {
    name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: `${PACKAGE}#LintRequest`, create: () => lintRequestSchema },
  }], cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: `${PACKAGE}#LintReport`, create: () => lintReportSchema },
}
export const contribution: TypertRemoteContribution = { package: PACKAGE, descriptors: [descriptor, policyDescriptor, lintDescriptor] }

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'promptEnhancer/enhance': (sessionId: SessionId, request: EnhanceRequest, signal?: AbortSignal) => Promise<RemoteResult<EnhanceResponse>>
    'promptEnhancer/policy': (sessionId: SessionId, signal?: AbortSignal) => Promise<RemoteResult<EnhancePolicy>>
    'promptEnhancer/lint': (sessionId: SessionId, request: LintRequest, signal?: AbortSignal) => Promise<RemoteResult<LintReport>>
  }
  interface TypertRemoteNamespaceMap {
    promptEnhancer: {
      policy(sessionId: SessionId, signal?: AbortSignal): Promise<RemoteResult<EnhancePolicy>>
      enhance(sessionId: SessionId, request: EnhanceRequest, signal?: AbortSignal): Promise<RemoteResult<EnhanceResponse>>
      lint(sessionId: SessionId, request: LintRequest, signal?: AbortSignal): Promise<RemoteResult<LintReport>>
    }
  }
  interface RemoteErrorDetailsMap {
    'prompt-enhancer/rejected': { readonly reason: string }
  }
}

export default contribution

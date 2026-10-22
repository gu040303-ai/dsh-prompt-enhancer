/** Locale keys of the failure copy the composer may report. */
export type FailureKey =
  | 'changed' | 'timeout' | 'tooLong' | 'busy' | 'incomplete'
  | 'emptyOutput' | 'auth' | 'rateLimit' | 'forbidden' | 'failed'

/**
 * @param error - whatever the remote call threw.
 * @param aborted - whether the caller cancelled the request.
 * @returns the locale key describing the failure, with the same precedence the
 * remote's reason codes and gateway codes are documented to have.
 */
export function failureKey(error: unknown, aborted: boolean): FailureKey {
  if (aborted) return 'changed'
  const reason = error !== null && typeof error === 'object' && 'details' in error
    ? (error as { details?: { reason?: string } }).details?.reason : undefined
  const code = error !== null && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (reason === 'timeout') return 'timeout'
  if (reason === 'input-too-long') return 'tooLong'
  if (reason === 'busy') return 'busy'
  if (reason === 'incomplete-output') return 'incomplete'
  if (reason === 'empty-output') return 'emptyOutput'
  if (reason !== undefined && ['AUTH', 'INVALID_CREDENTIAL', 'CREDENTIAL_MISSING'].includes(reason)) return 'auth'
  if (reason === 'RATE_LIMIT') return 'rateLimit'
  if (code === 'gateway/forbidden') return 'forbidden'
  return 'failed'
}

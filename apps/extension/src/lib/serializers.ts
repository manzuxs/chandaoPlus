/**
 * Helpers for extension side content serialization
 */
export function estimatePayloadSize(payload: any): number {
  return JSON.stringify(payload).length
}

export function computeBackoff(attempts, baseDelayMs = 1_000) {
  return baseDelayMs * 2 ** Math.max(0, attempts - 1);
}

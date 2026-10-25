// A finite, slow calculator for valid small inputs within one watermark interval.
export function smallWindowSum(events) {
  const latest = new Map();
  for (const event of events) {
    const key = JSON.stringify([event.tenantId, event.eventId]);
    const previous = latest.get(key);
    if (!previous || previous.revision < event.revision) latest.set(key, event);
  }
  return String([...latest.values()].reduce((total, event) => total + (event.deleted ? 0n : BigInt(event.amountMinor)), 0n));
}

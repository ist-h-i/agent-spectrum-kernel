export function createProcessor({ windowSize, allowedLateness, sink }) {
  const events = [];
  const watermarks = new Map();
  const emitted = new Set();
  return {
    ingest(event) {
      const start = Math.floor(event.eventTime / windowSize) * windowSize;
      if (start + windowSize + allowedLateness <= (watermarks.get(event.tenantId) ?? -Infinity)) {
        sink.reject({ event, reason: 'closed_window' });
        return { accepted: false, reason: 'closed_window' };
      }
      events.push(structuredClone(event));
      return { accepted: true };
    },
    advanceWatermark(tenantId, watermark) {
      watermarks.set(tenantId, watermark);
      const windows = new Map();
      for (const event of events) {
        if (event.tenantId !== tenantId) continue;
        const start = Math.floor(event.eventTime / windowSize) * windowSize;
        if (start + windowSize + allowedLateness > watermark) continue;
        if (!windows.has(start)) windows.set(start, 0n);
        if (!event.deleted) windows.set(start, windows.get(start) + BigInt(event.amountMinor));
      }
      for (const [start, amount] of [...windows].sort((a, b) => a[0] - b[0])) {
        const key = JSON.stringify([tenantId, start]);
        if (emitted.has(key)) continue;
        sink.finalize({ tenantId, start, end: start + windowSize, amountMinor: String(amount) });
        emitted.add(key);
      }
      return { accepted: true };
    },
    stats() { return { retainedEvents: events.length, tenants: watermarks.size }; }
  };
}

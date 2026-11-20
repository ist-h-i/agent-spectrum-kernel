// Desktop and archive clients upgraded separately.
export function lookupEvents(events, requests) {
  return requests.map(request => ({
    request_id: request?.request_id,
    events: events.filter(event =>
      event !== null && typeof event === 'object' && request !== null && typeof request === 'object' &&
      Number.isFinite(request.start) && Number.isFinite(request.end) && request.start <= request.end &&
      Number.isFinite(event.timestamp) && event.tenant === request.tenant && event.kind === request.kind &&
      event.timestamp >= request.start && event.timestamp <= request.end),
  }));
}

// First-generation restore adapter, still used by the single-export console.
export async function restore(manifest, requests, allowance, readPack) {
  const packs = manifest.zones.flatMap(zone => zone.packs);
  const cost = packs.reduce((sum, pack) => sum + pack.cost, 0);
  if (cost > allowance) return { status: 'over_budget', spent: 0, minimum: cost, statements: null };
  const blocks = new Map();
  let spent = 0;
  for (const pack of packs) {
    spent += pack.cost;
    try {
      for (const [id, rows] of Object.entries(await readPack(pack.id))) blocks.set(id, rows);
    } catch {
      return { status: 'unavailable', spent, minimum: null, statements: null };
    }
  }
  const tenants = manifest.zones.flatMap(zone => zone.tenants);
  const statements = requests.map(request => {
    const directory = tenants.find(tenant => tenant.id === request.tenant);
    const checkpoint = directory.checkpoints[0];
    const rows = checkpoint.blocks.flatMap(id => blocks.get(id));
    const entries = rows.filter(row => row.time >= request.from && row.time < request.until)
      .sort((left, right) => right.time - left.time || (left.key < right.key ? -1 : 1));
    return { count: entries.length, total: String(entries.reduce((n, row) => n + Number(row.cents), 0)),
      entries: entries.slice(0, request.limit) };
  });
  return { status: 'ok', spent, minimum: 0, statements };
}
